// Admin-only reconciliation for cross-agency sub-account transfers.
//
// When a GHL sub-account is moved from one agency to another, our
// `ghl_location_tokens.ghl_company_id` becomes stale. Refresh-time
// reconciliation (in `_shared/ghlToken.ts` and `refresh-ghl-tokens`) fixes
// this automatically the next time GHL returns a token — but if the old
// agency's refresh_token has already been revoked (typical for transfers)
// refresh 401s and can't self-heal.
//
// This function is the operator-run path: given the old and new companyIds
// plus an explicit list of transferred locationIds, verify each one against
// the NEW agency's PIT and update `ghl_company_id` in-place. PIT-based flows
// (audit, name backfill, ownership resolution, address fallback) start
// working immediately. OAuth-token-based flows (webhook, pipeline lists)
// still require the operator to reinstall the marketplace app on each
// transferred sub-account so a fresh access_token/refresh_token pair is
// minted under the new agency's OAuth client — that is a GHL constraint we
// can't work around from our side.
//
// POST body:
//   {
//     oldCompanyId: string,          // required — safety guard
//     newCompanyId: string,          // required — the new agency
//     locationIds: string[],         // required — explicit allow-list
//     dryRun?: boolean               // default true
//   }
//
// Response: per-location outcome + aggregate counts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/resolveCaller.ts";
import { getGhlPit } from "../_shared/ghlPit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-sso, x-ghl-location-id, x-ghl-iframe",
  "Access-Control-Max-Age": "86400",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Outcome =
  | { locationId: string; status: "updated" | "dry_run_would_update"; from: string; to: string }
  | { locationId: string; status: "skipped_not_found" }
  | { locationId: string; status: "skipped_company_mismatch"; actual: string | null }
  | { locationId: string; status: "verify_failed"; detail: string }
  | { locationId: string; status: "update_failed"; detail: string };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // AuthN/Z: super-admin only. Accept service-role bearer as an escape hatch
  // for sandbox invocations.
  const authHeader = req.headers.get("Authorization") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isServiceRole =
    serviceRoleKey.length > 0 && authHeader === `Bearer ${serviceRoleKey}`;
  if (!isServiceRole) {
    const caller = await resolveCaller(req, admin);
    if (!caller.ok) return j({ error: caller.error }, caller.status);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.userId);
    const isSuperAdmin = (roles ?? []).some((r: any) => r.role === "super_admin");
    if (!isSuperAdmin) return j({ error: "forbidden_super_admin_only" }, 403);
  }

  let body: any = {};
  try { body = await req.json(); } catch {}
  const oldCompanyId = String(body.oldCompanyId ?? "").trim();
  const newCompanyId = String(body.newCompanyId ?? "").trim();
  const locationIds: string[] = Array.isArray(body.locationIds)
    ? body.locationIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean)
    : [];
  const dryRun = body.dryRun !== false; // default true

  if (!oldCompanyId || !newCompanyId) {
    return j({ error: "missing_oldCompanyId_or_newCompanyId" }, 400);
  }
  if (oldCompanyId === newCompanyId) {
    return j({ error: "old_and_new_company_are_identical" }, 400);
  }
  if (locationIds.length === 0) {
    return j({ error: "locationIds_empty" }, 400);
  }

  // Resolve the NEW agency's PIT — we verify against the new agency because
  // that's the agency we're claiming owns each location now.
  const pitLookup = getGhlPit(newCompanyId);
  if (!pitLookup.token) {
    return j({
      error: "missing_pit_for_new_company",
      expected: pitLookup.secretName,
    }, 500);
  }

  const outcomes: Outcome[] = [];

  for (const locationId of locationIds) {
    const { data: row } = await admin
      .from("ghl_location_tokens")
      .select("ghl_location_id, ghl_company_id")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (!row) {
      outcomes.push({ locationId, status: "skipped_not_found" });
      continue;
    }
    if ((row as any).ghl_company_id !== oldCompanyId) {
      outcomes.push({
        locationId,
        status: "skipped_company_mismatch",
        actual: (row as any).ghl_company_id ?? null,
      });
      continue;
    }

    // Verify: fetch /locations/{id} with the NEW agency's PIT. If GHL returns
    // 200 the new agency truly owns this sub-account.
    let verifyDetail = "";
    let verified = false;
    try {
      const r = await fetch(
        `${GHL_BASE}/locations/${encodeURIComponent(locationId)}`,
        {
          headers: {
            Authorization: `Bearer ${pitLookup.token}`,
            Version: GHL_VERSION,
            Accept: "application/json",
          },
        },
      );
      if (r.ok) {
        verified = true;
      } else {
        const text = await r.text();
        verifyDetail = `${r.status}: ${text.slice(0, 200)}`;
      }
    } catch (e: any) {
      verifyDetail = `threw: ${e?.message ?? "err"}`;
    }
    if (!verified) {
      outcomes.push({ locationId, status: "verify_failed", detail: verifyDetail });
      continue;
    }

    if (dryRun) {
      outcomes.push({
        locationId,
        status: "dry_run_would_update",
        from: oldCompanyId,
        to: newCompanyId,
      });
      continue;
    }

    const { error: upErr } = await admin
      .from("ghl_location_tokens")
      .update({ ghl_company_id: newCompanyId, updated_at: new Date().toISOString() })
      .eq("ghl_location_id", locationId);
    if (upErr) {
      outcomes.push({ locationId, status: "update_failed", detail: upErr.message });
      continue;
    }
    try {
      await admin.from("ownership_audit_log").insert({
        location_id: locationId,
        action: "company_id_reconciled",
        executed_by: "reconcile-location-company",
        detail: {
          from: oldCompanyId,
          to: newCompanyId,
          source: "admin_edge_function",
          verified_via: "pit_locations_get",
        },
      });
    } catch (e) {
      console.error("ownership_audit_log insert failed (reconcile-location-company)", e);
    }

    outcomes.push({
      locationId,
      status: "updated",
      from: oldCompanyId,
      to: newCompanyId,
    });
  }

  const summary = {
    total: outcomes.length,
    updated: outcomes.filter((o) => o.status === "updated").length,
    dry_run_would_update: outcomes.filter((o) => o.status === "dry_run_would_update").length,
    skipped_not_found: outcomes.filter((o) => o.status === "skipped_not_found").length,
    skipped_company_mismatch: outcomes.filter((o) => o.status === "skipped_company_mismatch").length,
    verify_failed: outcomes.filter((o) => o.status === "verify_failed").length,
    update_failed: outcomes.filter((o) => o.status === "update_failed").length,
  };

  return j({
    ok: true,
    dryRun,
    oldCompanyId,
    newCompanyId,
    pit_secret_used: pitLookup.secretName,
    summary,
    outcomes,
  });
});
