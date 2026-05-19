// One-shot: backfill ghl_location_tokens.location_name for rows where it's NULL,
// using the GHL Agency Private Integration Token to look up /locations/{id}.
// Scope: optionally filter by ?companyId=<id> (defaults to all).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAndResolveLocationName } from "../_shared/ghlLocationName.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CONCURRENCY = 6;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const pit = Deno.env.get("GHL_AGENCY_PIT_TOKEN") ?? "";
  if (!pit) return json({ error: "missing_GHL_AGENCY_PIT_TOKEN" }, 500);

  let body: { companyId?: string } = {};
  try { body = await req.json(); } catch {}
  const companyFilter = body.companyId ?? null;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let q = admin
    .from("ghl_location_tokens")
    .select("id, ghl_location_id, ghl_company_id, location_name")
    .is("location_name", null)
    .not("ghl_location_id", "is", null);
  if (companyFilter) q = q.eq("ghl_company_id", companyFilter);

  const { data: rows, error } = await q;
  if (error) return json({ error: error.message }, 500);

  const targets = rows ?? [];
  const outcomes: Array<{
    location_id: string;
    status: "success" | "fallback_used" | "no_name_found" | "fetch_failed";
    source: string;
    old_name: string | null;
    new_name: string | null;
    detail?: string;
  }> = [];

  // Concurrency pool.
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const i = cursor++;
      const row: any = targets[i];
      const lid = row.ghl_location_id as string;
      try {
        const res = await fetchAndResolveLocationName(lid, pit);
        if (res.source === "fetch_failed") {
          outcomes.push({ location_id: lid, status: "fetch_failed", source: res.source, old_name: row.location_name, new_name: null, detail: res.detail });
          await logOutcome(admin, lid, "fetch_failed", { detail: res.detail });
          continue;
        }
        if (!res.name) {
          outcomes.push({ location_id: lid, status: "no_name_found", source: res.source, old_name: row.location_name, new_name: null });
          await logOutcome(admin, lid, "no_name_found", {});
          continue;
        }
        const { error: updErr } = await admin
          .from("ghl_location_tokens")
          .update({ location_name: res.name, updated_at: new Date().toISOString() })
          .eq("id", row.id);
        if (updErr) {
          outcomes.push({ location_id: lid, status: "fetch_failed", source: res.source, old_name: row.location_name, new_name: res.name, detail: `update: ${updErr.message}` });
          continue;
        }
        const status = res.source === "name" ? "success" : "fallback_used";
        outcomes.push({ location_id: lid, status, source: res.source, old_name: row.location_name, new_name: res.name });
        await logOutcome(admin, lid, status, { source: res.source, name: res.name });
      } catch (e: any) {
        outcomes.push({ location_id: lid, status: "fetch_failed", source: "fetch_failed", old_name: row.location_name, new_name: null, detail: e?.message ?? "err" });
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, targets.length) }, () => worker()));

  const summary = {
    total: targets.length,
    success: outcomes.filter(o => o.status === "success").length,
    fallback_used: outcomes.filter(o => o.status === "fallback_used").length,
    no_name_found: outcomes.filter(o => o.status === "no_name_found").length,
    fetch_failed: outcomes.filter(o => o.status === "fetch_failed").length,
  };
  return json({ summary, outcomes });
});

async function logOutcome(admin: any, locationId: string, status: string, detail: Record<string, unknown>) {
  try {
    await admin.from("ownership_audit_log").insert({
      location_id: locationId,
      action: `name_backfill_${status}`,
      executed_by: "backfill-location-names",
      detail,
    });
  } catch (e) {
    console.error("ownership_audit_log insert failed", e);
  }
}

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
