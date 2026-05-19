// GHL Opportunity webhook: receives stage-change events, looks up the location's
// access token, fetches the opportunity + pipeline stage name, and writes a row
// to `deals` when the stage name contains "dispo".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchContactAddress, formatContactAddress } from "../_shared/ghlContactAddress.ts";


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

    if (!stageId || !pipelineId) {
      return j({ ok: true, skipped: "missing_pipeline_or_stage", pipelineId: pipelineId ?? null, stageId: stageId ?? null }, 200);
    }

    // Mapping is REQUIRED. If the location admin hasn't explicitly mapped this
    // GHL stage in Pipeline Mapping, do NOT create a deal — otherwise every
    // opportunity in every installed sub-account would be ingested uninvited.
    const { data: mapping } = await admin
      .from("ghl_dispo_stage_mappings")
      .select("ghl_pipeline_id, ghl_pipeline_name, ghl_stage_name, workspace_owner_user_id")
      .eq("ghl_location_id", locationId)
      .eq("ghl_pipeline_id", pipelineId)
      .eq("ghl_stage_id", stageId)
      .maybeSingle();

    if (!mapping) {
      console.log(`skipped: no mapping for location=${locationId} pipeline=${pipelineId} stage=${stageId}`);
      return j({ ok: true, skipped: "no_mapping", locationId, pipelineId, stageId }, 200);
    }

    // SECURITY: never attribute a GHL-imported deal to a Lovable workspace user.
    // Store the GHL identity (assignedTo) in a dedicated column instead.
    const ghlAssignedUserId =
      body.assignedTo || body.assigned_to || opp.assignedTo || opp.assigned_to || null;

    // Capture seller contact details from GHL payload (Wave 2a). Keep these
    // in sync on every webhook fire — overwrite when GHL sends new values,
    // preserve existing when GHL omits them.
    const contact = opp.contact ?? body.contact ?? {};
    const composedName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
    const sellerName = composedName || contact.name || body.contactName || null;
    const sellerPhone = contact.phone || body.phone || null;
    const sellerEmail = contact.email || body.email || null;
    const ghlContactId = body.contactId || opp.contactId || contact.id || contact._id || null;

    // Homeowner Name = opportunity name. Lead Source = opportunity.source (whatever string GHL returns).
    const homeownerName = (opp.name ?? body.name ?? "").toString().trim() || null;
    const leadSource =
      (opp.source ?? body.source ?? opp.opportunitySource ?? null) || null;

    // Property Address = formatted contact address. Resolve from inline payload first,
    // then fall back to a PIT-backed /contacts/{id} fetch.
    let propertyAddress: string | null = null;
    const inlineAddress = await (async () => {
      // Try to build from inline contact payload first (no extra fetch).
      const { formatContactAddress } = await import("../_shared/ghlContactAddress.ts");
      return formatContactAddress(contact);
    })();
    if (inlineAddress) {
      propertyAddress = inlineAddress;
    } else if (ghlContactId) {
      const pit = Deno.env.get("GHL_AGENCY_PIT_TOKEN") ?? "";
      if (pit) {
        const r = await fetchContactAddress(ghlContactId, pit);
        if (r.formatted) propertyAddress = r.formatted;
        else console.log("contact address resolution:", r.source, r.detail ?? "");
      }
    }

    let written = false;
    let insertError: string | null = null;

    const { data: existing, error: selErr } = await admin
      .from("deals")
      .select("id, seller_name, seller_phone, seller_email, ghl_contact_id, property_address, homeowner_name, lead_source")
      .eq("ghl_opportunity_id", opportunityId)
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (selErr) {
      console.error("deal select failed", selErr);
      insertError = `select: ${selErr.message}`;
    } else if (existing) {
      // UPSERT: keep seller fields in sync, but only overwrite when we got a fresh value.
      const patch: Record<string, unknown> = {};
      if (sellerName) patch.seller_name = sellerName;
      if (sellerPhone) patch.seller_phone = sellerPhone;
      if (sellerEmail) patch.seller_email = sellerEmail;
      if (ghlContactId) patch.ghl_contact_id = ghlContactId;
      if (ghlAssignedUserId) patch.ghl_assigned_user_id = ghlAssignedUserId;
      patch.ghl_pipeline_id = pipelineId;
      if (stageId) patch.ghl_pipeline_stage_id = stageId;
      if (homeownerName) patch.homeowner_name = homeownerName;
      if (propertyAddress) patch.property_address = propertyAddress;
      if (leadSource) patch.lead_source = leadSource;
      if (Object.keys(patch).length > 0) {
        const { error: updErr } = await admin.from("deals").update(patch).eq("id", existing.id);
        if (updErr) {
          console.error("deal update failed", updErr);
          insertError = `update: ${updErr.message}`;
        }
      }
      written = true;
    } else {
      const { error: insErr } = await admin
        .from("deals")
        .insert({
          user_id: null,
          ghl_assigned_user_id: ghlAssignedUserId,
          property_address: propertyAddress ?? "",
          homeowner_name: homeownerName,
          status: "lead",
          lead_source: leadSource,
          ghl_opportunity_id: opportunityId,
          ghl_location_id: locationId,
          ghl_pipeline_id: pipelineId,
          ghl_pipeline_stage_id: stageId,
          ghl_contact_id: ghlContactId,
          seller_name: sellerName,
          seller_phone: sellerPhone,
          seller_email: sellerEmail,
          notes: `Imported from GHL stage "${mapping.ghl_stage_name ?? stageId}"`,
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
