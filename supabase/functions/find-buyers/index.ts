import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-location-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REVEAL_COST = 100;

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
    if (!LOVABLE_API_KEY) return json({ error: "LOVABLE_API_KEY not configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const userId = userData?.user?.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // ── Determine paywall state ─────────────
    // admin / subscription => all archive contacts auto-revealed.
    // Otherwise => per-buyer pay-to-reveal (100 credits each via reveal_archive_buyer RPC).
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

    // Already-revealed buyer ids for this location (sticky reveals)
    const revealedIds = new Set<string>();
    if (ghl_location_id) {
      const { data: reveals } = await admin
        .from("archive_buyer_reveals")
        .select("buyer_id")
        .eq("ghl_location_id", ghl_location_id);
      for (const r of reveals || []) revealedIds.add(r.buyer_id);
    }

    // Pull two pools in parallel
    const [rolodexResp, archiveResp, archiveCountResp] = await Promise.all([
      userId
        ? admin
            .from("buyers")
            .select("id, name, email, phone, markets, property_types, price_min, price_max, source, company_name")
            .eq("user_id", userId)
            .eq("is_archived", false)
            .limit(300)
        : Promise.resolve({ data: [] as any[] }),
      admin
        .from("archive_buyers")
        .select("id, full_name, first_name, last_name, email, phone, preferred_markets, property_types, price_min, price_max, sources, is_active, city, state")
        .eq("is_active", true)
        .limit(500),
      // Tighter count for the locked teaser — match preferred_markets to State/City/Zip tokens
      countArchiveMatches(admin, ctx),
    ]);

    const rolodex = rolodexResp.data || [];
    const archive = (archiveResp.data || []).map((r: any) => ({
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
    }));

    const [rolodexMatches, archiveMatches] = await Promise.all([
      rankWithAI(rolodex, address, ctx, propertyType, priceHint, LOVABLE_API_KEY),
      rankWithAI(archive, address, ctx, propertyType, priceHint, LOVABLE_API_KEY),
    ]);

    // Count for teaser: prefer the AI-ranked matches when available, fall back to the rough query count.
    const archiveCount = Math.max(archiveMatches.length, archiveCountResp);

    // STATE 3: suppress card details, return count + teaser metadata only.
    const archiveLocked = archiveState === "locked";
    const archivePayload = archiveLocked ? [] : archiveMatches;

    return json({
      rolodex: rolodexMatches,
      archive: archivePayload,
      archive_locked: archiveLocked,
      archive_count: archiveCount,
      archive_state: archiveState,
      archive_reveal_cost: REVEAL_COST,
      archive_location_label: [city, state].filter(Boolean).join(", "),
      public: [],
      public_available: false,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

async function countArchiveMatches(admin: any, ctx: { city?: string; state?: string; zip?: string }): Promise<number> {
  try {
    const stateLc = (ctx.state || "").toLowerCase().trim();
    const cityLc = (ctx.city || "").toLowerCase().trim();
    const zipLc = (ctx.zip || "").toLowerCase().trim();
    if (!stateLc && !cityLc && !zipLc) return 0;
    // Pull active rows and match in JS — preferred_markets is small and tokens
    // are inconsistently cased ("City:philadelphia, PA" vs "City:Philadelphia, PA").
    const { data } = await admin
      .from("archive_buyers")
      .select("preferred_markets")
      .eq("is_active", true)
      .limit(2000);
    if (!Array.isArray(data)) return 0;
    let n = 0;
    for (const row of data) {
      const markets = (row.preferred_markets || []).map((m: string) => String(m).toLowerCase());
      const hit =
        (cityLc && markets.some((m) => m.includes(`city:${cityLc}`))) ||
        (stateLc && markets.some((m) => m.includes(`state:${stateLc}`))) ||
        (zipLc && markets.some((m) => m.includes(`zip:${zipLc}`))) ||
        (stateLc && markets.some((m) => m.includes(`, ${stateLc}`)));
      if (hit) n++;
    }
    return n;
  } catch (e) {
    console.error("countArchiveMatches", e);
    return 0;
  }
}

async function rankWithAI(
  candidates: any[],
  address: string,
  ctx: { street?: string; city?: string; state?: string; zip?: string },
  propertyType: string | undefined,
  priceHint: string | undefined,
  apiKey: string,
): Promise<any[]> {
  if (!candidates || candidates.length === 0) return [];

  const compact = candidates.map((b) => ({
    id: b.id,
    name: b.name,
    markets: b.markets || [],
    property_types: b.property_types || [],
    price_min: b.price_min,
    price_max: b.price_max,
    source: b.source,
  }));

  const sys = `You are a real-estate acquisitions assistant. Given a property's structured address and a list of cash buyers (with target markets, property types, and price ranges), return the top 5 best-matching buyers ranked by fit. Markets may be formatted as "State:TX", "City:Chicago, IL", "County:Dallas, TX", or "Zip:75001". Match strictly on the property's State, City, and Zip — do not match a county to a city of the same name. Also weigh property type and price range alignment. Be concise.`;

  const userPrompt = `Property:
- Full address: ${address}
- Street: ${ctx.street || ""}
- City: ${ctx.city || ""}
- State: ${ctx.state || ""}
- Zip: ${ctx.zip || ""}
${propertyType ? `Property type: ${propertyType}\n` : ""}${priceHint ? `Estimated price: ${priceHint}\n` : ""}
Candidate buyers (JSON):
${JSON.stringify(compact)}

Return the top 5 matches with a 1-sentence reason each and a fit score 0-100.`;

  const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: userPrompt },
      ],
      tools: [{
        type: "function",
        function: {
          name: "return_matches",
          description: "Return ranked buyer matches",
          parameters: {
            type: "object",
            properties: {
              matches: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    buyer_id: { type: "string" },
                    score: { type: "number" },
                    reason: { type: "string" },
                  },
                  required: ["buyer_id", "score", "reason"],
                },
              },
            },
            required: ["matches"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "return_matches" } },
    }),
  });

  let aiMatches: any[] = [];
  try {
    if (aiResp.ok) {
      const aiJson = await aiResp.json();
      const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
      const args = toolCall ? JSON.parse(toolCall.function.arguments) : { matches: [] };
      aiMatches = args.matches || [];
    } else {
      console.error("AI error", aiResp.status, await aiResp.text());
    }
  } catch (e) {
    console.error("AI parse error", e);
  }
  const byId = new Map(candidates.map((c) => [c.id, c]));
  let mapped = aiMatches
    .map((m: any) => ({ ...byId.get(m.buyer_id), score: m.score, reason: m.reason }))
    .filter((m: any) => m.id);

  // Fallback: AI returned nothing (failure or empty). Build a deterministic
  // ranking from token overlap so paid users never see an empty archive when
  // candidates exist.
  if (mapped.length === 0 && candidates.length > 0) {
    const stateLc = (ctx.state || "").toLowerCase().trim();
    const cityLc = (ctx.city || "").toLowerCase().trim();
    const zipLc = (ctx.zip || "").toLowerCase().trim();
    const scored = candidates.map((c: any) => {
      const markets = (c.markets || []).map((m: string) => String(m).toLowerCase());
      let score = 0;
      const reasons: string[] = [];
      if (cityLc && markets.some((m) => m.includes(`city:${cityLc}`))) {
        score += 70; reasons.push(`city ${ctx.city}`);
      }
      if (stateLc && markets.some((m) => m.includes(`state:${stateLc}`))) {
        score += 40; reasons.push(`state ${ctx.state}`);
      }
      if (zipLc && markets.some((m) => m.includes(`zip:${zipLc}`))) {
        score += 30; reasons.push(`zip ${ctx.zip}`);
      }
      if (stateLc && markets.some((m) => m.includes(`, ${stateLc}`))) {
        score += 15; reasons.push(`region in ${ctx.state}`);
      }
      if (markets.length === 0) { score += 10; reasons.push("no market restrictions"); }
      return { ...c, score, reason: reasons.length ? `Match on ${reasons.join(", ")}.` : "Generalist buyer." };
    });
    mapped = scored.sort((a, b) => b.score - a.score).slice(0, 5);
  }
  return mapped;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
