// Operator Account management — single edge function that resolves the
// caller via iframe SSO (x-ghl-sso) or Bearer JWT, then performs reads
// and mutations under the service role. This fixes the iframe identity
// bug where supabase.auth.getUser() in the iframe falls back to the
// parent browser's standalone session (e.g. a super_admin's identity).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/resolveCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ghl-sso",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Body {
  action: "list" | "create" | "add" | "remove";
  name?: string;
  location_ids?: string[];
  location_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const caller = await resolveCaller(req, admin);
    if (!caller.ok) {
      console.log("operator-account resolve_failed", {
        status: caller.status,
        error: caller.error,
        has_sso: Boolean(req.headers.get("x-ghl-sso")),
        has_auth: Boolean(req.headers.get("Authorization")),
      });
      return json({ error: caller.error }, caller.status);
    }
    const userId = caller.userId;
    console.log("operator-account resolved", {
      user_id: userId,
      via_iframe: caller.viaIframe,
      sso_location_id: caller.ssoLocationId,
      email: caller.email,
    });

    const body = (await req.json().catch(() => ({}))) as Body;
    const action = body.action;

    // ---- list: owned locations (with names) + current group context ----
    if (action === "list") {
      const { data: memberships } = await admin
        .from("location_memberships")
        .select("location_id")
        .eq("user_id", userId);
      const ids = (memberships ?? []).map((m: any) => m.location_id);
      console.log("operator-account list memberships", { user_id: userId, ids });

      let owned: any[] = [];
      if (ids.length > 0) {
        const { data: tokens } = await admin
          .from("ghl_location_tokens")
          .select("ghl_location_id, location_name, operator_account_id")
          .in("ghl_location_id", ids);
        console.log("operator-account list token_rows", {
          user_id: userId,
          rows: (tokens ?? []).map((t: any) => ({
            ghl_location_id: t.ghl_location_id,
            location_name: t.location_name,
            operator_account_id: t.operator_account_id,
          })),
        });
        owned = (tokens ?? []).map((t: any) => ({
          location_id: t.ghl_location_id,
          name: t.location_name || null,
          operator_account_id: t.operator_account_id ?? null,
        }));
      }

      // Active location is whatever the iframe sent OR (standalone) the
      // first owned location. We use it to look up which group is "current".
      const activeLoc =
        caller.viaIframe
          ? caller.ssoLocationId
          : owned[0]?.location_id ?? null;

      let op: any = null;
      let opLocations: any[] = [];
      const currentRow = owned.find((l) => l.location_id === activeLoc);
      if (currentRow?.operator_account_id) {
        const { data: opRow } = await admin
          .from("operator_accounts")
          .select("id,name,subscription_status,current_period_end,credit_balance,owner_user_id")
          .eq("id", currentRow.operator_account_id)
          .maybeSingle();
        op = opRow ?? null;
        // Include ALL locations in the group, even ones the caller doesn't
        // own personally (super_admin or co-owner scenarios).
        const { data: sibs } = await admin
          .from("ghl_location_tokens")
          .select("ghl_location_id, location_name, operator_account_id")
          .eq("operator_account_id", currentRow.operator_account_id);
        opLocations = (sibs ?? []).map((t: any) => ({
          location_id: t.ghl_location_id,
          name: t.location_name || null,
          operator_account_id: t.operator_account_id,
        }));
      }

      return json({
        viewer_user_id: userId,
        active_location_id: activeLoc,
        owned,
        op,
        op_locations: opLocations,
      });
    }

    // ---- create: name + selected owned location ids ----
    if (action === "create") {
      const name = (body.name ?? "").trim();
      const picks = Array.isArray(body.location_ids) ? body.location_ids : [];
      if (!name) return json({ error: "missing_name" }, 400);
      if (picks.length === 0) return json({ error: "no_locations_selected" }, 400);

      // Verify caller owns every picked location.
      const { data: ownedRows } = await admin
        .from("location_memberships")
        .select("location_id")
        .eq("user_id", userId)
        .eq("is_owner", true)
        .in("location_id", picks);
      const ownedSet = new Set((ownedRows ?? []).map((r: any) => r.location_id));
      if (picks.some((id) => !ownedSet.has(id))) {
        return json({ error: "not_owner_of_all_locations" }, 403);
      }

      const { data: created, error: createErr } = await admin
        .from("operator_accounts")
        .insert({ name, owner_user_id: userId })
        .select()
        .single();
      if (createErr || !created) {
        return json({ error: createErr?.message || "create_failed" }, 500);
      }
      const { error: linkErr } = await admin
        .from("ghl_location_tokens")
        .update({ operator_account_id: (created as any).id })
        .in("ghl_location_id", picks);
      if (linkErr) return json({ error: linkErr.message }, 500);

      return json({ ok: true, operator_account_id: (created as any).id });
    }

    // ---- add / remove a single location to/from the caller's group ----
    if (action === "add" || action === "remove") {
      const locId = (body.location_id ?? "").trim();
      if (!locId) return json({ error: "missing_location_id" }, 400);

      // Verify caller owns the location.
      const { data: owns } = await admin
        .from("location_memberships")
        .select("id")
        .eq("user_id", userId)
        .eq("location_id", locId)
        .eq("is_owner", true)
        .maybeSingle();
      if (!owns) return json({ error: "not_owner_of_location" }, 403);

      if (action === "add") {
        // Resolve group from active location.
        const activeLoc = caller.viaIframe ? caller.ssoLocationId : null;
        if (!activeLoc) return json({ error: "no_active_location" }, 400);
        const { data: meTok } = await admin
          .from("ghl_location_tokens")
          .select("operator_account_id")
          .eq("ghl_location_id", activeLoc)
          .maybeSingle();
        const opId = (meTok as any)?.operator_account_id ?? null;
        if (!opId) return json({ error: "active_location_not_in_group" }, 400);

        const { error: upErr } = await admin
          .from("ghl_location_tokens")
          .update({ operator_account_id: opId })
          .eq("ghl_location_id", locId);
        if (upErr) return json({ error: upErr.message }, 500);
        return json({ ok: true });
      }

      // remove
      const { error: rmErr } = await admin
        .from("ghl_location_tokens")
        .update({ operator_account_id: null })
        .eq("ghl_location_id", locId);
      if (rmErr) return json({ error: rmErr.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "unknown_action" }, 400);
  } catch (e: any) {
    return json({ error: String(e?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
