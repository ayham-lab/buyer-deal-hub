// GHL Opportunity webhook: receives stage-change events, looks up the location's
// access token, fetches the opportunity + pipeline stage name, and writes a row
// to `deals` when the stage name contains "dispo".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

    const body = await req.json().catch(() => ({}));
    console.log("ghl-opportunity-webhook body:", JSON.stringify(body));

    const locationId = body.locationId || body.location_id;
    const opportunityId = body.opportunityId || body.opportunity_id || body.id;
    if (!locationId || !opportunityId) {
      return j({ error: "missing_location_or_opportunity" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenRow } = await admin
      .from("ghl_location_tokens")
      .select("access_token")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (!tokenRow?.access_token) {
      return j({ ok: true, skipped: "no_token" }, 200);
    }

    const ghlHeaders = {
      Authorization: `Bearer ${tokenRow.access_token}`,
      Version: "2021-07-28",
      Accept: "application/json",
    };

    // Fetch opportunity
    const oppRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/${opportunityId}`,
      { headers: ghlHeaders },
    );
    const oppText = await oppRes.text();
    if (!oppRes.ok) {
      console.error("opp fetch failed", oppRes.status, oppText);
      return j({ ok: true, skipped: "opp_fetch_failed", status: oppRes.status }, 200);
    }
    const oppJson = JSON.parse(oppText);
    const opp = oppJson.opportunity ?? oppJson;

    // Fetch pipelines to resolve stage name
    const pipeRes = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      { headers: ghlHeaders },
    );
    const pipeText = await pipeRes.text();
    let stageName = "";
    if (pipeRes.ok) {
      const pipeJson = JSON.parse(pipeText);
      const pipelines = pipeJson.pipelines ?? [];
      const stageId = body.pipelineStageId || opp.pipelineStageId;
      const pipelineId = body.pipelineId || opp.pipelineId;
      const pipeline = pipelines.find((p: any) => p.id === pipelineId) ?? pipelines[0];
      const stage = pipeline?.stages?.find((s: any) => s.id === stageId);
      stageName = stage?.name ?? "";
    } else {
      console.error("pipelines fetch failed", pipeRes.status, pipeText);
    }

    let written = false;
    if (stageName.toLowerCase().includes("dispo")) {
      // Find a workspace owner for this location to satisfy deals.user_id NOT NULL
      const { data: link } = await admin
        .from("ghl_location_links")
        .select("workspace_owner_user_id")
        .eq("ghl_location_id", locationId)
        .limit(1)
        .maybeSingle();

      if (link?.workspace_owner_user_id) {
        const address =
          opp.name ||
          opp.contact?.name ||
          `GHL Opportunity ${opportunityId}`;

        const { error: upErr } = await admin
          .from("deals")
          .upsert(
            {
              user_id: link.workspace_owner_user_id,
              property_address: address,
              status: "lead",
              lead_source: "ghl",
              ghl_opportunity_id: opportunityId,
              notes: `Imported from GHL stage "${stageName}"`,
            },
            { onConflict: "ghl_opportunity_id" },
          );
        if (upErr) console.error("deal upsert failed", upErr);
        else written = true;
      } else {
        console.log("no workspace owner for location", locationId);
      }
    }

    return j({ ok: true, written, stageName }, 200);
  } catch (err: any) {
    console.error("ghl-opportunity-webhook unhandled error", err);
    return j({ error: err?.message ?? "unexpected_error" }, 500);
  }
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
