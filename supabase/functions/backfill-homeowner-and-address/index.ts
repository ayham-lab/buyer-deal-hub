// One-shot backfill: split today's `address` (which holds the homeowner name) into
// `homeowner_name`, refresh `property_address` from the linked GHL contact via PIT,
// and refresh `lead_source` from the opportunity's source field.
//
// Idempotency: a marker row in `deal_activity` (event_type='homeowner_address_backfilled')
// is written per deal on completion. Deals with that marker are skipped on re-runs.
//
// Concurrency: 5 workers, 5-attempt exponential backoff on 429.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchContactAddress } from "../_shared/ghlContactAddress.ts";
import { resolveOppMapping } from "../_shared/oppFieldMapping.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";
const TARGET_COMPANY = "l5O3WVAjAPg6osSnZ16i";
const CONCURRENCY = 5;

interface DealRow {
  id: string;
  property_address: string | null;
  homeowner_name: string | null;
  lead_source: string | null;
  ghl_opportunity_id: string | null;
  ghl_contact_id: string | null;
  ghl_location_id: string | null;
}

interface Outcome {
  deal_id: string;
  buckets: string[];
}

async function fetchOpportunityFull(
  oppId: string,
  bearer: string,
): Promise<{ ok: boolean; source: string | null; name: string | null; detail?: string }> {
  const backoffs = [1500, 3000, 4500, 6000, 7500];
  for (let i = 0; i < backoffs.length; i++) {
    try {
      const resp = await fetch(`${GHL_BASE}/opportunities/${encodeURIComponent(oppId)}`, {
        headers: { Authorization: `Bearer ${bearer}`, Accept: "application/json", Version: GHL_API_VERSION },
      });
      const text = await resp.text();
      if (resp.status === 429) { await new Promise((r) => setTimeout(r, backoffs[i])); continue; }
      if (!resp.ok) return { source: null, name: null, ok: false, detail: `${resp.status}: ${text.slice(0, 200)}` };
      const j = JSON.parse(text);
      const opp = j.opportunity ?? j;
      return {
        source: (opp.source ?? opp.opportunitySource ?? null) || null,
        name: (opp.name ?? null) || null,
        ok: true,
      };
    } catch (e: any) {
      return { source: null, name: null, ok: false, detail: e?.message ?? "err" };
    }
  }
  return { source: null, name: null, ok: false, detail: "429_after_retries" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "1";

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const pit = Deno.env.get("GHL_AGENCY_PIT_TOKEN") ?? "";
  if (!pit) {
    return j({ error: "missing GHL_AGENCY_PIT_TOKEN" }, 500);
  }

  // Cache of per-location access tokens (contacts/opportunities require sub-account scope).
  const tokenCache = new Map<string, string>();
  async function locToken(locId: string): Promise<string> {
    if (tokenCache.has(locId)) return tokenCache.get(locId)!;
    const { data } = await admin
      .from("ghl_location_tokens")
      .select("access_token")
      .eq("ghl_location_id", locId)
      .maybeSingle();
    const t = (data as any)?.access_token || pit;
    tokenCache.set(locId, t);
    return t;
  }

  // Scope: every deal whose location belongs to the target company (via ghl_location_tokens).
  const { data: tokens, error: tokErr } = await admin
    .from("ghl_location_tokens")
    .select("ghl_location_id, ghl_company_id")
    .eq("ghl_company_id", TARGET_COMPANY);
  if (tokErr) return j({ error: tokErr.message }, 500);
  const locIds = (tokens ?? []).map((t: any) => t.ghl_location_id).filter(Boolean);
  if (locIds.length === 0) return j({ ok: true, total: 0, message: "no locations for company" }, 200);

  const { data: deals, error: dErr } = await admin
    .from("deals")
    .select("id, property_address, homeowner_name, lead_source, ghl_opportunity_id, ghl_contact_id, ghl_location_id")
    .in("ghl_location_id", locIds);
  if (dErr) return j({ error: dErr.message }, 500);

  const total = deals?.length ?? 0;

  // Skip rows already backfilled (marker in deal_activity), unless force=1.
  const ids = (deals ?? []).map((d: any) => d.id);
  const skipSet = new Set<string>();
  if (!force && ids.length > 0) {
    const { data: markers } = await admin
      .from("deal_activity")
      .select("deal_id")
      .in("deal_id", ids)
      .eq("event_type", "homeowner_address_backfilled");
    (markers ?? []).forEach((m: any) => skipSet.add(m.deal_id));
  }

  const counts = {
    homeowner_name_set: 0,
    address_refreshed: 0,
    address_extracted_from_opp_name: 0,
    address_not_available: 0,
    source_set: 0,
    source_not_available: 0,
    skipped_already_done: 0,
    fetch_failed: 0,
  };
  const outcomes: Outcome[] = [];

  const queue = (deals ?? []) as DealRow[];
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      const myIdx = idx++;
      const d = queue[myIdx];
      const buckets: string[] = [];

      if (skipSet.has(d.id)) {
        counts.skipped_already_done++;
        outcomes.push({ deal_id: d.id, buckets: ["skipped_already_done"] });
        continue;
      }

      const patch: Record<string, unknown> = {};

      // Fetch opportunity (name + source) and contact (address + names).
      let oppName: string | null = null;
      let oppSource: string | null = null;
      let oppFetchOk = false;
      if (d.ghl_opportunity_id && d.ghl_location_id) {
        const bearer = await locToken(d.ghl_location_id);
        const or = await fetchOpportunityFull(d.ghl_opportunity_id, bearer);
        if (or.ok) {
          oppFetchOk = true;
          oppName = or.name;
          oppSource = or.source;
        } else {
          counts.fetch_failed++;
          buckets.push(`fetch_failed:opp:${or.detail ?? ""}`);
        }
      }

      let contactObj: any = null;
      let contactFormattedAddress: string | null = null;
      let contactFetchState: "ok" | "no_address" | "fetch_failed" | "skipped" = "skipped";
      if (d.ghl_contact_id && d.ghl_location_id) {
        const bearer = await locToken(d.ghl_location_id);
        const r = await fetchContactAddress(d.ghl_contact_id, bearer);
        contactFetchState = r.source;
        if (r.contact) contactObj = r.contact;
        if (r.formatted) contactFormattedAddress = r.formatted;
      }

      // Smart mapping
      const mapping = resolveOppMapping({
        oppName,
        contact: contactObj,
        contactFormattedAddress,
      });
      buckets.push(`path:${mapping.path}`);

      if (mapping.homeowner_name) {
        patch.homeowner_name = mapping.homeowner_name;
        counts.homeowner_name_set++;
        buckets.push("homeowner_name_set");
      }

      if (mapping.property_address) {
        patch.property_address = mapping.property_address;
        if (mapping.addressFromOppName) {
          counts.address_extracted_from_opp_name++;
          buckets.push("address_extracted_from_opp_name");
        } else {
          counts.address_refreshed++;
          buckets.push("address_refreshed");
        }
      } else {
        // No address from either source
        patch.property_address = "";
        counts.address_not_available++;
        if (contactFetchState === "fetch_failed") {
          counts.fetch_failed++;
          buckets.push("fetch_failed:address");
        } else {
          buckets.push("address_not_available");
        }
      }

      // Lead source
      if (oppFetchOk) {
        if (oppSource) {
          patch.lead_source = oppSource;
          counts.source_set++;
          buckets.push("source_set");
        } else {
          counts.source_not_available++;
          buckets.push("source_not_available");
        }
      } else if (!d.ghl_opportunity_id) {
        counts.source_not_available++;
        buckets.push("source_not_available");
      }

      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await admin.from("deals").update(patch).eq("id", d.id);
        if (upErr) {
          counts.fetch_failed++;
          buckets.push(`update_failed:${upErr.message}`);
        }
      }

      // Marker (always written so re-runs skip this row).
      await admin.from("deal_activity").insert({
        deal_id: d.id,
        user_id: null,
        event_type: "homeowner_address_backfilled",
        to_value: null,
        metadata: { buckets },
      });

      outcomes.push({ deal_id: d.id, buckets });
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  return j({
    ok: true,
    total,
    counts,
    sample: outcomes.slice(0, 20),
  }, 200);
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
