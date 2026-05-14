import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { address, street, city, state, zip, propertyType, priceHint } = await req.json();
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

    // Pull two pools in parallel
    const [rolodexResp, archiveResp] = await Promise.all([
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
        .select("id, full_name, first_name, last_name, email, phone, preferred_markets, property_types, price_min, price_max, sources, is_active")
        .eq("is_active", true)
        .limit(500),
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
      source: Array.isArray(r.sources) && r.sources.length ? `${r.sources.length} tenant(s)` : null,
    }));

    const [rolodexMatches, archiveMatches] = await Promise.all([
      rankWithAI(rolodex, address, ctx, propertyType, priceHint, LOVABLE_API_KEY),
      rankWithAI(archive, address, ctx, propertyType, priceHint, LOVABLE_API_KEY),
    ]);

    // Public data buyers: not connected yet — return empty group with a flag
    return json({
      rolodex: rolodexMatches,
      archive: archiveMatches,
      public: [],
      public_available: false,
    });
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

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

  if (!aiResp.ok) {
    console.error("AI error", aiResp.status, await aiResp.text());
    return [];
  }
  const aiJson = await aiResp.json();
  const toolCall = aiJson.choices?.[0]?.message?.tool_calls?.[0];
  const args = toolCall ? JSON.parse(toolCall.function.arguments) : { matches: [] };
  const byId = new Map(candidates.map((c) => [c.id, c]));
  return (args.matches || [])
    .map((m: any) => ({ ...byId.get(m.buyer_id), score: m.score, reason: m.reason }))
    .filter((m: any) => m.id);
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
