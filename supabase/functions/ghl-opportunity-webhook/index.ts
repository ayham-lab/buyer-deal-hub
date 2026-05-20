// GHL Opportunity webhook: receives stage-change events, looks up the location's
// access token, fetches the opportunity + pipeline stage name, and writes a row
// to `deals` when the stage name contains "dispo".
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchContactAddress, formatContactAddress } from "../_shared/ghlContactAddress.ts";
import { resolveOppMapping } from "../_shared/oppFieldMapping.ts";


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

    const rawOppName = (opp.name ?? body.name ?? "").toString().trim() || null;
    const leadSource =
      (opp.source ?? body.source ?? opp.opportunitySource ?? null) || null;

    // Resolve contact address (inline first, then /contacts/{id}); also capture
    // the fetched contact so we can pull firstName/lastName when the opp.name
    // turns out to be an address.
    let contactFormattedAddress: string | null = null;
    let fetchedContact: any = null;
    const inlineAddress = formatContactAddress(contact);

    if (inlineAddress) {
      contactFormattedAddress = inlineAddress;
    }
    if (ghlContactId) {
      let r = await fetchContactAddress(ghlContactId, tokenRow.access_token);
      if (r.source === "fetch_failed") {
        const pit = Deno.env.get("GHL_AGENCY_PIT_TOKEN") ?? "";
        if (pit) {
          console.log("contact address: location token failed, falling back to PIT", r.source, r.detail ?? "");
          r = await fetchContactAddress(ghlContactId, pit);
        }
      }
      if (r.contact) fetchedContact = r.contact;
      if (r.formatted) contactFormattedAddress = r.formatted;
      else if (r.source === "fetch_failed") console.log("contact address resolution:", r.source, r.detail ?? "");
    }

    const mappingContact = fetchedContact ?? contact;
    const fieldMapping = resolveOppMapping({
      oppName: rawOppName,
      contact: mappingContact,
      contactFormattedAddress,
    });
    const homeownerName = fieldMapping.homeowner_name;
    const propertyAddress = fieldMapping.property_address;
    console.log(`opp-mapping path=${fieldMapping.path} opp=${opportunityId} addr=${propertyAddress ?? ""} homeowner=${homeownerName ?? ""}`);

    let written = false;
    let insertError: string | null = null;
    let action: string = "noop";

    // Normalize event type from GHL payload (varies by webhook config)
    const eventType: string =
      (body.type || body.eventType || body.event || "").toString();
    const isStageEvent =
      eventType === "OpportunityStageUpdate" ||
      eventType === "OpportunityStageChange" ||
      eventType === "OpportunityStatusUpdate";
    const isCreateEvent = eventType === "OpportunityCreate";
    // Treat unknown/empty event types as permissive (legacy / direct invocation),
    // but explicitly known non-creating events block insertion.
    const NON_CREATING_EVENTS = new Set([
      "OpportunityUpdate",
      "ContactUpdate",
      "ContactCreate",
      "ContactDelete",
      "OpportunityDelete",
      "NoteCreate",
      "TaskCreate",
      "AppointmentCreate",
    ]);

    const { data: existing, error: selErr } = await admin
      .from("deals")
      .select("id, seller_name, seller_phone, seller_email, ghl_contact_id, property_address, homeowner_name, lead_source, deleted_at, ghl_pipeline_stage_id")
      .eq("ghl_opportunity_id", opportunityId)
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (selErr) {
      console.error("deal select failed", selErr);
      insertError = `select: ${selErr.message}`;
    } else if (existing) {
      // Build the field patch from current GHL payload
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

      if (existing.deleted_at) {
        const stageChanged = existing.ghl_pipeline_stage_id !== stageId;
        if (!stageChanged) {
          console.log(`skipped: soft-deleted, no stage change opp=${opportunityId}`);
          return j({
            ok: true,
            skipped: "soft_deleted_no_stage_change",
            dealId: existing.id,
            eventType: eventType || null,
          }, 200);
        }
        // Resurrect: clear deleted_at + apply patch + log activity
        patch.deleted_at = null;
        patch.deleted_by = null;
        const { error: updErr } = await admin.from("deals").update(patch).eq("id", existing.id);
        if (updErr) {
          console.error("deal resurrect failed", updErr);
          insertError = `resurrect: ${updErr.message}`;
        } else {
          await admin.from("deal_activity").insert({
            deal_id: existing.id,
            user_id: null,
            event_type: "resurrected_from_stage_change",
            from_value: existing.ghl_pipeline_stage_id ?? null,
            to_value: stageId,
            metadata: {
              source: "ghl_webhook",
              event_type: eventType || null,
              prior_stage: existing.ghl_pipeline_stage_id,
              new_stage: stageId,
              new_stage_name: mapping.ghl_stage_name ?? null,
            },
          });
          action = "resurrected";
          written = true;
        }
      } else {
        if (Object.keys(patch).length > 0) {
          const { error: updErr } = await admin.from("deals").update(patch).eq("id", existing.id);
          if (updErr) {
            console.error("deal update failed", updErr);
            insertError = `update: ${updErr.message}`;
          } else {
            action = "patched";
            written = true;
          }
        } else {
          action = "patched_noop";
          written = true;
        }
      }
    } else {
      // No existing row — gate inserts on event type so we don't ingest
      // every contact/opportunity edit as a fresh Dispo deal.
      if (eventType && NON_CREATING_EVENTS.has(eventType) && !isStageEvent && !isCreateEvent) {
        console.log(`skipped insert: event_type=${eventType} for new opp=${opportunityId}`);
        return j({
          ok: true,
          skipped: "insert_blocked_event_type",
          eventType,
          locationId,
          pipelineId,
          stageId,
        }, 200);
      }

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
          notes: `Imported from GHL stage "${mapping.ghl_stage_name ?? stageId}" (event=${eventType || "unknown"})`,
        });
      if (insErr) {
        console.error("deal insert failed", insErr);
        insertError = `insert: ${insErr.message}`;
      } else {
        action = "inserted";
        written = true;
      }
    }


    return j({ ok: true, written, action, eventType: eventType || null, stageId, stageName: mapping?.ghl_stage_name ?? null, mapped: !!mapping, ghlAssignedUserId, insertError }, 200);
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
