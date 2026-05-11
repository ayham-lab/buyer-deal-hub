// Deletes GHL-imported deals for a location whose pipeline stage is not present
// in ghl_dispo_stage_mappings. Two modes: ?dryRun=true returns count only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-location-id, x-ghl-iframe",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    const locationId: string | undefined = body.locationId || body.ghl_location_id;
    const dryRun: boolean = !!body.dryRun;
    if (!locationId) return j({ error: "missing_location" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Mapped pipeline/stage pairs for this location.
    const { data: maps, error: mapErr } = await admin
      .from("ghl_dispo_stage_mappings")
      .select("ghl_pipeline_id, ghl_stage_id")
      .eq("ghl_location_id", locationId);
    if (mapErr) return j({ error: mapErr.message }, 500);
    const mappedPairs = new Set((maps ?? []).map((m: any) => `${m.ghl_pipeline_id}:${m.ghl_stage_id}`));

    // Candidate deals: GHL-imported in this location whose pipeline/stage pair is NOT mapped
    // (includes deals with NULL pipeline/stage ids — older imports before we tracked them).
    const { data: candidates, error: selErr } = await admin
      .from("deals")
      .select("id, ghl_pipeline_id, ghl_pipeline_stage_id")
      .eq("ghl_location_id", locationId)
      .not("ghl_opportunity_id", "is", null);
    if (selErr) return j({ error: selErr.message }, 500);
    const ids = ((candidates ?? []) as any[])
      .filter((d) => !d.ghl_pipeline_id || !d.ghl_pipeline_stage_id || !mappedPairs.has(`${d.ghl_pipeline_id}:${d.ghl_pipeline_stage_id}`))
      .map((d) => d.id);

    if (dryRun) {
      return j({ ok: true, count: ids.length });
    }

    if (ids.length === 0) return j({ ok: true, deleted: 0 });

    const { error: delErr } = await admin.from("deals").delete().in("id", ids);
    if (delErr) return j({ error: delErr.message }, 500);
    return j({ ok: true, deleted: ids.length });
  } catch (e: any) {
    return j({ error: e?.message ?? "unexpected_error" }, 500);
  }
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
