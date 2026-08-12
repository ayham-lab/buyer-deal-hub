import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { METRO_MAP, normalizeState } from "../_shared/matching/geo.ts";
import { parsePrice } from "../_shared/matching/price.ts";
import {
  archiveBuyerToFacts,
  rolodexBuyerToFacts,
  scoreBuyer,
} from "../_shared/matching/score.ts";
import type { CanonicalPropertyType, PropertyQuery } from "../_shared/matching/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-location-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REVEAL_COST = 100;

const CANONICAL_TYPES = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];

// Sanitize a value for use inside a PostgREST .or() filter: strip quotes/backslashes
// (lossy but safe) and wrap in double quotes so commas/braces can't break the parser.
const pgQuote = (v: string) => `"${v.replace(/[\\"]/g, "").trim()}"`;

const ARCHIVE_COLS =
  "id, full_name, first_name, last_name, email, phone, preferred_markets, preferred_zips, property_types, price_min, price_max, sources, city, state, national, status, buyer_activity, completed_transaction, system_deals_purchased, last_active_at";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { address, street, city, state, zip, propertyType, priceHint } = body;
    const ghl_location_id: string | null =
      body.ghl_location_id || req.headers.get("x-ghl-location-id") || null;
    if (!address || typeof address !== "string") {
      return json({ error: "address is required" }, 400);
    }
    const ctx = { street, city, state, zip };

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    let archiveState: "admin" | "subscription" | "pay_per_reveal" = "pay_per_reveal";
    let creditBalance = 0;
    if (userId) {
      const { data: roles } = await admin
        .from("user_roles").select("role").eq("user_id", userId);
      const isAdmin = (roles || []).some((r: any) =>
        r.role === "admin" || r.role === "super_admin");
      if (isAdmin) archiveState = "admin";
    }
    if (archiveState !== "admin" && ghl_location_id) {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("subscription_status, current_period_end")
        .eq("ghl_location_id", ghl_location_id)
        .maybeSingle();
      const subActive = sub?.subscription_status === "active" &&
        (!sub?.current_period_end || new Date(sub.current_period_end) > new Date());
      if (subActive) archiveState = "subscription";
    }
    if (ghl_location_id) {
      const { data: bal } = await admin
        .from("credit_balances")
        .select("balance")
        .eq("ghl_location_id", ghl_location_id)
        .maybeSingle();
      creditBalance = bal?.balance ?? 0;
    }

    const revealedIds = new Set<string>();
    if (ghl_location_id) {
      const { data: reveals } = await admin
        .from("archive_buyer_reveals")
        .select("buyer_id")
        .eq("ghl_location_id", ghl_location_id);
      for (const r of reveals || []) revealedIds.add(r.buyer_id);
    }

    // ── Build the property query once ──
    const cityLc = (ctx.city || "").toLowerCase().trim();
    const { abbr: stateAbbr, full: stateFull } = normalizeState(ctx.state);
    const stateAbbrLc = stateAbbr.toLowerCase();
    const stateFullLc = stateFull.toLowerCase();
    const zipClean = String(ctx.zip || "").trim().match(/^\d{5}/)?.[0] ?? "";

    const metroKey = cityLc && stateAbbr ? `${cityLc}, ${stateAbbrLc}` : "";
    const metroCities = METRO_MAP[metroKey] || [];

    const pq: PropertyQuery = {
      city: (ctx.city || "").trim(),
      stateAbbr,
      stateFull,
      zip: zipClean,
      propertyType: CANONICAL_TYPES.includes(propertyType)
        ? propertyType as CanonicalPropertyType
        : "",
      price: parsePrice(priceHint),
      metroCities,
    };

    // ── Build candidate pool from archive_buyers ──
    // Each query is ordered so the row cap keeps proven/recent buyers first.
    const archiveQuery = () =>
      admin.from("archive_buyers")
        .select(ARCHIVE_COLS)
        .eq("is_active", true)
        .order("completed_transaction", { ascending: false })
        .order("last_active_at", { ascending: false, nullsFirst: false });

    const queries: PromiseLike<any>[] = [];
    if (stateFull || stateAbbr) {
      const stateOr = [
        stateFull && `state.ilike.${pgQuote(stateFull)}`,
        stateAbbr && `state.ilike.${pgQuote(stateAbbr)}`,
      ].filter(Boolean).join(",");
      queries.push(archiveQuery().or(stateOr).limit(3000));
    }
    // National flagged buyers
    queries.push(archiveQuery().eq("national", true).limit(1000));
    // Undeclared buyers — no state column AND empty preferred_markets. Surface as tier 4
    // so legacy rolodex auto-promoted records (no location data) still appear.
    queries.push(
      archiveQuery().is("state", null)
        .or("preferred_markets.eq.{},preferred_markets.is.null").limit(500)
    );
    // Buyers whose preferred_markets contains the state name/abbrev or city — catches rows
    // that don't have the state column populated.
    if (cityLc || stateFullLc || stateAbbrLc) {
      const tokens = [cityLc, stateFullLc, stateAbbrLc, ...metroCities].filter(Boolean);
      const orParts = tokens
        .map(pgQuote)
        .filter((t) => t !== '""')
        .map((t) => `preferred_markets.cs.{${t}}`)
        .join(",");
      if (orParts) queries.push(archiveQuery().or(orParts).limit(2000));
    }
    // Zip-targeted buyers: 'zip:12345' market tokens or preferred_zips jsonb entries
    if (zipClean) {
      queries.push(
        archiveQuery()
          .or(`preferred_markets.cs.{${pgQuote(`zip:${zipClean}`)}},preferred_zips.cs.${JSON.stringify([zipClean])}`)
          .limit(500)
      );
    }

    const [rolodexResp, ...archiveResps] = await Promise.all([
      userId
        ? admin.from("buyers")
            .select("id, name, first_name, last_name, email, phone, markets, property_types, other_property_type, price_min, price_max, source, company_name, buyer_status, buyer_types, buyer_activity, deals_purchased, criteria_notes, proof_of_funds_files, previous_deals, experience")
            .eq("user_id", userId).eq("is_archived", false).limit(300)
        : Promise.resolve({ data: [] as any[] }),
      ...queries,
    ]);

    const seen = new Map<string, any>();
    for (const resp of archiveResps) {
      for (const r of (resp?.data || [])) {
        if (!seen.has(r.id)) seen.set(r.id, r);
      }
    }

    // ── Score archive candidates (deterministic multi-factor) ──
    const scored: any[] = [];
    for (const r of seen.values()) {
      const facts = archiveBuyerToFacts(r);
      const res = scoreBuyer(pq, facts);
      if (res.dropped) continue;

      scored.push({
        id: r.id,
        name: r.full_name || [r.first_name, r.last_name].filter(Boolean).join(" ") || "—",
        email: r.email,
        phone: r.phone,
        markets: r.preferred_markets || [],
        property_types: r.property_types || [],
        price_min: r.price_min,
        price_max: r.price_max,
        city: r.city,
        state: r.state,
        source: Array.isArray(r.sources) && r.sources.length ? `${r.sources.length} tenant(s)` : null,
        score: res.score,
        tier: res.tier,
        reason: res.reason,
        profile_completeness: facts.completeness,
        profile_complete: facts.profileComplete,
      });
    }

    scored.sort((a, b) =>
      b.score - a.score ||
      (b.profile_completeness ?? 0) - (a.profile_completeness ?? 0) ||
      a.name.localeCompare(b.name)
    );
    const archiveMatches = scored.slice(0, 60);

    // ── Rolodex (private buyers): deterministic scoring + optional AI nudge ──
    const rolodexScored = (rolodexResp.data || [])
      .map((b: any) => {
        const facts = rolodexBuyerToFacts(b);
        const res = scoreBuyer(pq, facts);
        return { b, facts, res };
      })
      .filter((x: any) => !x.res.dropped)
      .sort((a: any, b: any) =>
        b.res.score - a.res.score ||
        b.facts.completeness - a.facts.completeness
      );

    const aiPool = rolodexScored.slice(0, 12).map(({ b, res }: any) => ({
      id: b.id, name: b.name, markets: b.markets || [],
      property_types: b.property_types || [],
      price_min: b.price_min, price_max: b.price_max, source: b.source,
      det_score: res.score, det_reason: res.reason,
    }));
    const aiById = LOVABLE_API_KEY
      ? await rankWithAI(aiPool, address, ctx, propertyType, priceHint, LOVABLE_API_KEY)
      : new Map<string, { score: number; reason: string }>();

    const rolodexMatches = rolodexScored.slice(0, 12)
      .map(({ b, facts, res }: any) => {
        const ai = aiById.get(b.id);
        // AI may nudge the deterministic score by at most ±8, half-weighted
        const score = ai
          ? Math.max(0, Math.min(100, Math.round(res.score + Math.max(-8, Math.min(8, ai.score - res.score)) * 0.5)))
          : res.score;
        return {
          id: b.id, name: b.name, email: b.email, phone: b.phone,
          markets: b.markets || [], property_types: b.property_types || [],
          price_min: b.price_min, price_max: b.price_max, source: b.source,
          buyer_status: b.buyer_status,
          score,
          tier: res.tier,
          reason: ai?.reason?.trim() ? ai.reason : res.reason,
          profile_completeness: facts.completeness,
          profile_complete: facts.profileComplete,
        };
      })
      .sort((a: any, b: any) =>
        (b.score ?? 0) - (a.score ?? 0) ||
        (b.profile_completeness ?? 0) - (a.profile_completeness ?? 0)
      )
      .slice(0, 5);

    const autoReveal = archiveState === "admin" || archiveState === "subscription";
    const archivePayload = archiveMatches.map((m: any) => {
      const revealed = autoReveal || revealedIds.has(m.id);
      return revealed
        ? { ...m, revealed: true }
        : { ...m, email: null, phone: null, source: null, revealed: false };
    });

    return json({
      rolodex: rolodexMatches,
      archive: archivePayload,
      archive_locked: false,
      archive_count: archiveMatches.length,
      archive_state: archiveState,
      archive_reveal_cost: REVEAL_COST,
      archive_credit_balance: creditBalance,
      archive_location_label: [city, state].filter(Boolean).join(", "),
      public: [],
      public_available: false,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

// Optional AI re-rank of the top deterministic rolodex candidates.
// Returns a map of buyer_id → {score, reason}; empty map on any failure so the
// deterministic ranking always stands on its own.
async function rankWithAI(
  candidates: any[],
  address: string,
  ctx: { street?: string; city?: string; state?: string; zip?: string },
  propertyType: string | undefined,
  priceHint: string | undefined,
  apiKey: string,
): Promise<Map<string, { score: number; reason: string }>> {
  const out = new Map<string, { score: number; reason: string }>();
  if (!candidates || candidates.length === 0) return out;

  const sys = `You are a real-estate acquisitions assistant. Given a property and a list of cash buyers (each with a deterministic pre-score), return a refined score 0-100 and a 1-sentence reason for each buyer. Be concise.`;
  const userPrompt = `Property: ${address}\nCity: ${ctx.city || ""}, State: ${ctx.state || ""}, Zip: ${ctx.zip || ""}\n${propertyType ? `Type: ${propertyType}\n` : ""}${priceHint ? `Price: ${priceHint}\n` : ""}\nBuyers: ${JSON.stringify(candidates)}\nReturn every buyer with score 0-100 and a 1-sentence reason.`;

  try {
    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [{ role: "system", content: sys }, { role: "user", content: userPrompt }],
        tools: [{
          type: "function",
          function: {
            name: "return_matches",
            parameters: {
              type: "object",
              properties: { matches: { type: "array", items: { type: "object", properties: {
                buyer_id: { type: "string" }, score: { type: "number" }, reason: { type: "string" }
              }, required: ["buyer_id","score","reason"] } } },
              required: ["matches"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_matches" } },
      }),
    });
    if (aiResp.ok) {
      const aiJson = await aiResp.json();
      const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : { matches: [] };
      for (const m of args.matches || []) {
        if (typeof m.buyer_id === "string" && typeof m.score === "number") {
          out.set(m.buyer_id, { score: m.score, reason: String(m.reason ?? "") });
        }
      }
    }
  } catch (e) { console.error("AI rank error", e); }

  return out;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
