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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Capture raw request for debug logging (best-effort)
  const headersObj: Record<string, string> = {};
  req.headers.forEach((v, k) => { headersObj[k] = v; });
  const rawBody = await req.text().catch(() => "");
  let parsedBody: unknown = null;
  try { parsedBody = rawBody ? JSON.parse(rawBody) : null; } catch { parsedBody = { _raw: rawBody }; }

  admin.from("webhook_debug_log").insert({
    function_name: "ghl-opportunity-webhook",
    method: req.method,
    headers: headersObj,
    body: parsedBody as any,
    ip: headersObj["x-forwarded-for"] ?? headersObj["x-real-ip"] ?? null,
    user_agent: headersObj["user-agent"] ?? null,
  }).then(({ error }) => {
    if (error) console.error("webhook_debug_log insert failed", error);
  });

  try {
    if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

    const body = (parsedBody && typeof parsedBody === "object" ? parsedBody : {}) as any;
    console.log("ghl-opportunity-webhook body:", JSON.stringify(body));

    const locationId = body.locationId || body.location_id;
    const opportunityId = body.opportunityId || body.opportunity_id || body.id;
    if (!locationId || !opportunityId) {
      return j({ error: "missing_location_or_opportunity" }, 400);
    }

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

    const stageId = body.pipelineStageId || opp.pipelineStageId;
    const pipelineId = body.pipelineId || opp.pipelineId;
    console.log("ghl-opportunity-webhook locationId:", locationId, "stageId:", stageId, "pipelineId:", pipelineId);

    if (!stageId) {
      return j({ ok: true, skipped: "no_stage_id" }, 200);
    }

    // Mapping is OPTIONAL: when absent, we still ingest the opportunity as a "lead"
    // so the Pipeline kanban shows it instead of silently dropping it.
    const { data: mapping } = await admin
      .from("ghl_dispo_stage_mappings")
      .select("ghl_pipeline_id, ghl_pipeline_name, ghl_stage_name, workspace_owner_user_id")
      .eq("ghl_location_id", locationId)
      .eq("ghl_stage_id", stageId)
      .maybeSingle();

    // SECURITY: never attribute a GHL-imported deal to a Lovable workspace user.
    // Store the GHL identity (assignedTo) in a dedicated column instead.
    const ghlAssignedUserId =
      body.assignedTo || body.assigned_to || opp.assignedTo || opp.assigned_to || null;

    let written = false;
    let insertError: string | null = null;
    const address =
      opp.name ||
      opp.contact?.name ||
      `GHL Opportunity ${opportunityId}`;

    const { data: existing, error: selErr } = await admin
      .from("deals")
      .select("id")
      .eq("ghl_opportunity_id", opportunityId)
      .maybeSingle();

    if (selErr) {
      console.error("deal select failed", selErr);
      insertError = `select: ${selErr.message}`;
    } else if (existing) {
      written = true;
    } else {
      const { error: insErr } = await admin
        .from("deals")
        .insert({
          user_id: null,
          ghl_assigned_user_id: ghlAssignedUserId,
          property_address: address,
          status: "lead",
          lead_source: "ghl",
          ghl_opportunity_id: opportunityId,
          ghl_location_id: locationId,
          notes: mapping
            ? `Imported from GHL stage "${mapping.ghl_stage_name ?? stageId}"`
            : `Imported from GHL (stage ${stageId} not yet mapped — defaulted to Lead)`,
        });
      if (insErr) {
        console.error("deal insert failed", insErr);
        insertError = `insert: ${insErr.message}`;
      } else {
        written = true;
      }
    }

    return j({ ok: true, written, stageId, stageName: mapping?.ghl_stage_name ?? null, mapped: !!mapping, ghlAssignedUserId, insertError }, 200);
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
