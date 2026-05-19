// One-shot backfill: for every location that has a refresh_token in
// oauth_install_log.payload but NO row in ghl_location_tokens, refresh the
// token via /oauth/token and insert the row. Reports per-location outcome.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveGhlAdminForLocation, ghlUserDisplayName, provisionAuthUserByEmail } from "../_shared/ghlOwnership.ts";
import { resolveOrFetchName } from "../_shared/ghlLocationName.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const client_id = Deno.env.get("GHL_MARKETPLACE_CLIENT_ID") ?? "";
  const client_secret = Deno.env.get("GHL_MARKETPLACE_CLIENT_SECRET") ?? "";
  if (!client_id || !client_secret) return json({ error: "missing_client_credentials" }, 500);

  // Find locations with a refresh_token in install log but no token row.


  const { data: logs, error: logErr } = await admin
    .from("oauth_install_log")
    .select("location_id, company_id, payload, created_at")
    .not("location_id", "is", null)
    .order("created_at", { ascending: false });
  if (logErr) return json({ error: `log_query: ${logErr.message}` }, 500);

  const { data: existing, error: exErr } = await admin
    .from("ghl_location_tokens")
    .select("ghl_location_id");
  if (exErr) return json({ error: `existing_query: ${exErr.message}` }, 500);
  const have = new Set((existing ?? []).map((r: any) => r.ghl_location_id));

  // Latest-per-location with refresh_token, not already in tokens.
  const seen = new Set<string>();
  const targets: { location_id: string; company_id: string | null; refresh_token: string; location_name?: string | null }[] = [];
  for (const row of logs ?? []) {
    const lid = (row as any).location_id as string;
    if (!lid || seen.has(lid) || have.has(lid)) continue;
    const p = (row as any).payload ?? {};
    const rt = p?.refresh_token ?? p?.refreshToken;
    if (!rt) continue;
    seen.add(lid);
    targets.push({
      location_id: lid,
      company_id: (row as any).company_id ?? p?.companyId ?? p?.company_id ?? null,
      refresh_token: rt,
      location_name: p?.locationName ?? p?.name ?? null,
    });
  }

  const results: Array<{ location_id: string; status: string; detail?: string }> = [];

  for (const t of targets) {
    try {
      const form = new URLSearchParams({
        client_id, client_secret,
        grant_type: "refresh_token",
        refresh_token: t.refresh_token,
      });
      const resp = await fetch(`${GHL_BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
      });
      const text = await resp.text();
      if (!resp.ok) {
        results.push({ location_id: t.location_id, status: "failed_refresh", detail: `${resp.status}: ${text.slice(0, 200)}` });
        await admin.from("oauth_install_log").insert({
          source: "backfill-missing-tokens",
          location_id: t.location_id,
          company_id: t.company_id,
          error: `refresh ${resp.status}: ${text.slice(0, 300)}`,
        });
        continue;
      }
      const j = JSON.parse(text);
      const expiresAt = new Date(Date.now() + (Number(j.expires_in) || 0) * 1000).toISOString();
      const name = t.location_name ?? await resolveOrFetchName(null, t.location_id);
      const row = {
        ghl_location_id: t.location_id,
        ghl_company_id: j.companyId ?? j.company_id ?? t.company_id,
        location_name: name,
        access_token: j.access_token,
        refresh_token: j.refresh_token ?? t.refresh_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      };
      const { error: insErr } = await admin
        .from("ghl_location_tokens")
        .upsert(row, { onConflict: "ghl_location_id" });
      if (insErr) {
        results.push({ location_id: t.location_id, status: "failed_insert", detail: insErr.message });
        await admin.from("oauth_install_log").insert({
          source: "backfill-missing-tokens",
          location_id: t.location_id, company_id: row.ghl_company_id,
          error: `insert: ${insErr.message}`, payload: j,
        });
        continue;
      }
      results.push({ location_id: t.location_id, status: "success" });
      await admin.from("oauth_install_log").insert({
        source: "backfill-missing-tokens",
        location_id: t.location_id, company_id: row.ghl_company_id,
        payload: { backfilled: true },
      });
      if (row.ghl_company_id) await seedOwnerFromGhl(admin, t.location_id, row.ghl_company_id);
    } catch (e: any) {
      results.push({ location_id: t.location_id, status: "failed_refresh", detail: `threw: ${e?.message ?? "err"}` });
    }
  }

  const summary = {
    targets: targets.length,
    success: results.filter(r => r.status === "success").length,
    failed_refresh: results.filter(r => r.status === "failed_refresh").length,
    failed_insert: results.filter(r => r.status === "failed_insert").length,
  };
  return json({ summary, results });
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function seedOwnerFromGhl(admin: any, locationId: string, companyId: string) {
  try {
    const { data: existingLink } = await admin
      .from("ghl_location_links")
      .select("workspace_owner_user_id")
      .eq("ghl_location_id", locationId)
      .not("workspace_owner_user_id", "is", null)
      .limit(1).maybeSingle();
    if (existingLink?.workspace_owner_user_id) return;
    const verdict = await resolveGhlAdminForLocation(companyId, locationId);
    if (verdict.verdict === "admin") {
      const u = verdict.user;
      const ownerId = await provisionAuthUserByEmail(admin, u.email, ghlUserDisplayName(u), u.id);
      if (!ownerId) { await queueManual(admin, locationId, companyId, "ghl_admin_no_email", u); return; }
      await admin.from("ghl_location_links").upsert({
        user_id: ownerId, workspace_owner_user_id: ownerId, linked_by_user_id: ownerId,
        ghl_location_id: locationId, ghl_company_id: companyId,
      }, { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true });
      await admin.from("location_memberships").upsert(
        { location_id: locationId, user_id: ownerId, role: "owner", is_owner: true },
        { onConflict: "location_id,user_id" },
      );
      await admin.from("ownership_audit_log").insert({
        location_id: locationId, action: "insert", new_owner_user_id: ownerId,
        ghl_admin_user_id: u.id, ghl_admin_email: u.email,
        executed_by: "backfill-missing-tokens", detail: { source: "ghl_admin_lookup" },
      });
    } else if (verdict.verdict === "no_admin") {
      await queueManual(admin, locationId, companyId, "no_ghl_admin", null);
    } else if (verdict.verdict === "unresolved") {
      await queueManual(admin, locationId, companyId, "multiple_unresolved", verdict.admins);
    } else {
      await queueManual(admin, locationId, companyId, `fetch_failed: ${verdict.detail.slice(0, 200)}`, null);
    }
  } catch (e) { console.error("seedOwnerFromGhl failed", e); }
}

async function queueManual(admin: any, locationId: string, companyId: string | null, reason: string, snapshot: unknown) {
  await admin.from("manual_review_queue").upsert({
    location_id: locationId, ghl_company_id: companyId, reason,
    ghl_users_snapshot: snapshot ?? null, status: "pending",
  }, { onConflict: "location_id", ignoreDuplicates: true });
  await admin.from("ownership_audit_log").insert({
    location_id: locationId, action: "queue_manual",
    executed_by: "backfill-missing-tokens", detail: { reason },
  });
}
