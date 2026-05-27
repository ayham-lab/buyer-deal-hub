// Admin-only one-off backfill for a single GHL opportunity that never reached
// public.deals (e.g. it predates app install, or its Create event was lost
// during a webhook outage). Mirrors the resolve/insert path used by
// ghl-opportunity-webhook, but is driven by an explicit opportunityId.
//
// POST body: { opportunityId: string, locationId: string, dryRun?: boolean }
// Requires caller to be super_admin.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidGhlAccessToken } from "../_shared/ghlToken.ts";
import { fetchContactAddress, formatContactAddress } from "../_shared/ghlContactAddress.ts";
import { resolveOppMapping } from "../_shared/oppFieldMapping.ts";
import { resolveCaller } from "../_shared/resolveCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-sso, x-ghl-location-id, x-ghl-iframe",
  "Access-Control-Max-Age": "86400",
};

const j = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // AuthN/Z — accept service-role bearer (for one-off sandbox runs) OR a
  // resolved super_admin caller.
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
  const opportunityId = String(body.opportunityId ?? "").trim();
  const locationId = String(body.locationId ?? "").trim();
  const dryRun = !!body.dryRun;
  if (!opportunityId || !locationId) {
    return j({ error: "missing_opportunityId_or_locationId" }, 400);
  }

  // Token (refresh if needed)
  const { data: tokenRow } = await admin
    .from("ghl_location_tokens")
    .select("ghl_location_id, ghl_company_id, access_token, refresh_token, expires_at")
    .eq("ghl_location_id", locationId)
    .maybeSingle();
  if (!tokenRow) return j({ error: "no_token_for_location" }, 404);

  const tok = await getValidGhlAccessToken(admin, tokenRow as any);
  if (tok.error) return j({ error: `token_refresh_failed: ${tok.error}` }, 502);

  const ghlHeaders = {
    Authorization: `Bearer ${tok.access_token}`,
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
    return j({ error: "opp_fetch_failed", status: oppRes.status, body: oppText.slice(0, 500) }, 502);
  }
  const oppJson = JSON.parse(oppText);
  const opp = oppJson.opportunity ?? oppJson;

  const pipelineId = opp.pipelineId;
  const stageId = opp.pipelineStageId;
  if (!pipelineId || !stageId) {
    return j({ error: "opp_missing_pipeline_or_stage", opp }, 422);
  }

  // Mapping check — refuse to insert unmapped opps.
  const { data: mapping } = await admin
    .from("ghl_dispo_stage_mappings")
    .select("ghl_pipeline_id, ghl_pipeline_name, ghl_stage_id, ghl_stage_name")
    .eq("ghl_location_id", locationId)
    .eq("ghl_pipeline_id", pipelineId)
    .eq("ghl_stage_id", stageId)
    .maybeSingle();
  if (!mapping) {
    return j({
      ok: false,
      reason: "no_mapping",
      message: "Opportunity's current pipeline/stage is not mapped — refusing to insert.",
      ghl: { pipelineId, stageId, status: opp.status, name: opp.name },
    }, 200);
  }

  // Pull contact details (same logic as webhook)
  const contact = opp.contact ?? {};
  const composedName = [contact.firstName, contact.lastName].filter(Boolean).join(" ").trim();
  const sellerName = composedName || contact.name || opp.contactName || null;
  const sellerPhone = contact.phone || null;
  const sellerEmail = contact.email || null;
  const ghlContactId = opp.contactId || contact.id || contact._id || null;
  const ghlAssignedUserId = opp.assignedTo || opp.assigned_to || null;
  const leadSource = opp.source ?? opp.opportunitySource ?? null;
  const rawOppName = (opp.name ?? "").toString().trim() || null;

  let contactFormattedAddress: string | null = formatContactAddress(contact);
  let fetchedContact: any = null;
  if (ghlContactId) {
    let r = await fetchContactAddress(ghlContactId, tok.access_token);
    if (r.source === "fetch_failed") {
      const pit = Deno.env.get("GHL_AGENCY_PIT_TOKEN") ?? "";
      if (pit) r = await fetchContactAddress(ghlContactId, pit);
    }
    if (r.contact) fetchedContact = r.contact;
    if (r.formatted) contactFormattedAddress = r.formatted;
  }
  const mappingContact = fetchedContact ?? contact;
  const fieldMapping = resolveOppMapping({
    oppName: rawOppName,
    contact: mappingContact,
    contactFormattedAddress,
  });

  const row = {
    user_id: null as string | null,
    ghl_assigned_user_id: ghlAssignedUserId,
    property_address: fieldMapping.property_address ?? "",
    homeowner_name: fieldMapping.homeowner_name,
    status: "lead" as const,
    lead_source: leadSource,
    ghl_opportunity_id: opportunityId,
    ghl_location_id: locationId,
    ghl_pipeline_id: pipelineId,
    ghl_pipeline_stage_id: stageId,
    ghl_contact_id: ghlContactId,
    seller_name: sellerName,
    seller_phone: sellerPhone,
    seller_email: sellerEmail,
    notes: `Backfilled from GHL stage "${mapping.ghl_stage_name ?? stageId}" (one-off backfill-opportunity)`,
  };

  if (dryRun) return j({ ok: true, dryRun: true, mapping, row }, 200);

  // Idempotent upsert keyed on ghl_opportunity_id (unique partial index exists).
  const { data: upserted, error: upErr } = await admin
    .from("deals")
    .upsert(row, { onConflict: "ghl_opportunity_id" })
    .select("id, seller_name, status, ghl_pipeline_stage_id, ghl_location_id, created_at")
    .maybeSingle();

  if (upErr) return j({ error: "upsert_failed", detail: upErr.message }, 500);

  return j({ ok: true, action: "upserted", deal: upserted, mapping }, 200);
});
