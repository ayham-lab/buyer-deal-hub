import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-location-id",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const REVEAL_COST = 100;

// US state abbrev <-> full name
const STATE_FULL: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};
const STATE_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FULL).map(([k, v]) => [v.toLowerCase(), k])
);

// Best-effort metro/proximity map keyed by "city, ST" → nearby cities (lowercase)
const METRO_MAP: Record<string, string[]> = {
  "montgomery, al": ["prattville","wetumpka","millbrook","tallassee","tuskegee","pike road"],
  "birmingham, al": ["hoover","bessemer","homewood","vestavia","mountain brook","trussville","alabaster","pelham"],
  "huntsville, al": ["madison","decatur","athens","huntsville"],
  "mobile, al": ["daphne","fairhope","spanish fort","saraland","prichard"],
  "philadelphia, pa": ["camden","trenton","wilmington","norristown","king of prussia","cherry hill","upper darby","chester","levittown"],
  "pittsburgh, pa": ["mckeesport","monroeville","bethel park","greensburg","cranberry"],
  "phoenix, az": ["scottsdale","mesa","tempe","chandler","glendale","gilbert","peoria","surprise"],
  "atlanta, ga": ["marietta","alpharetta","sandy springs","roswell","decatur","smyrna","kennesaw","duluth","lawrenceville"],
  "dallas, tx": ["plano","irving","arlington","fort worth","frisco","mckinney","garland","richardson","mesquite"],
  "houston, tx": ["pasadena","sugar land","katy","pearland","spring","baytown","conroe","the woodlands"],
  "austin, tx": ["round rock","cedar park","pflugerville","georgetown","leander","kyle","buda"],
  "san antonio, tx": ["new braunfels","schertz","seguin","converse"],
  "miami, fl": ["hialeah","coral gables","miami beach","doral","kendall","homestead","aventura"],
  "orlando, fl": ["kissimmee","winter park","sanford","altamonte springs","apopka","ocoee"],
  "tampa, fl": ["st petersburg","st. petersburg","clearwater","brandon","largo","plant city"],
  "jacksonville, fl": ["orange park","st augustine","fernandina beach"],
  "chicago, il": ["naperville","aurora","joliet","evanston","oak park","schaumburg","cicero","skokie"],
  "los angeles, ca": ["long beach","glendale","santa monica","pasadena","burbank","torrance","inglewood","compton"],
  "san francisco, ca": ["oakland","berkeley","san jose","daly city","san mateo","fremont","hayward"],
  "san diego, ca": ["chula vista","oceanside","escondido","carlsbad","el cajon"],
  "new york, ny": ["brooklyn","queens","bronx","staten island","jersey city","newark","yonkers","hoboken"],
  "boston, ma": ["cambridge","quincy","newton","somerville","brookline","waltham","medford"],
  "denver, co": ["aurora","lakewood","centennial","arvada","westminster","thornton"],
  "seattle, wa": ["bellevue","tacoma","everett","redmond","kirkland","renton","kent"],
  "detroit, mi": ["dearborn","warren","sterling heights","livonia","southfield","royal oak"],
  "charlotte, nc": ["concord","gastonia","huntersville","matthews","monroe"],
  "raleigh, nc": ["cary","durham","chapel hill","apex","wake forest"],
  "nashville, tn": ["franklin","brentwood","murfreesboro","hendersonville","mount juliet"],
  "memphis, tn": ["germantown","collierville","bartlett","southaven"],
  "las vegas, nv": ["henderson","north las vegas","paradise","summerlin"],
  "columbus, oh": ["dublin","westerville","gahanna","hilliard","grove city"],
  "cleveland, oh": ["lakewood","parma","euclid","cleveland heights"],
  "cincinnati, oh": ["covington","norwood","blue ash"],
  "indianapolis, in": ["carmel","fishers","noblesville","greenwood","lawrence"],
  "kansas city, mo": ["overland park","independence","lee's summit","olathe","blue springs"],
  "st louis, mo": ["st. louis","clayton","ferguson","florissant","chesterfield"],
  "minneapolis, mn": ["st paul","st. paul","bloomington","plymouth","eagan","maple grove"],
  "milwaukee, wi": ["waukesha","racine","kenosha","west allis"],
  "baltimore, md": ["columbia","towson","dundalk","bel air","glen burnie"],
  "washington, dc": ["arlington","alexandria","silver spring","bethesda","rockville","gaithersburg"],
  "richmond, va": ["henrico","chesterfield","midlothian","mechanicsville"],
  "norfolk, va": ["virginia beach","chesapeake","portsmouth","hampton","newport news","suffolk"],
  "salt lake city, ut": ["west valley city","west jordan","sandy","orem","provo","ogden"],
  "portland, or": ["beaverton","gresham","hillsboro","tigard","lake oswego","vancouver"],
  "oklahoma city, ok": ["norman","edmond","moore","midwest city"],
  "tulsa, ok": ["broken arrow","owasso","bixby","sand springs"],
  "albuquerque, nm": ["rio rancho","santa fe","los lunas"],
  "louisville, ky": ["jeffersontown","st matthews","new albany"],
  "new orleans, la": ["metairie","kenner","gretna","slidell"],
  "honolulu, hi": ["pearl city","kailua","waipahu","kaneohe"],
};

const NATIONAL_KEYWORDS = ["all","any","anywhere","national","nationwide","everywhere","usa","u.s.","united states","open","flexible"];
const STATEWIDE_PHRASES = ["any in the state","anywhere in the state","entire state","whole state","statewide","state wide","all over"];

function nonEmptyStr(v: unknown): boolean { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArr(v: unknown): boolean { return Array.isArray(v) && v.length > 0; }

// Mirrors src/lib/buyerCompleteness.ts (rolodex buyers)
function rolodexCompleteness(b: any): { score: number; isComplete: boolean } {
  let score = 0;
  if (nonEmptyStr(b.name) || nonEmptyStr(b.first_name) || nonEmptyStr(b.last_name)) score += 10;
  if (nonEmptyStr(b.email)) score += 10;
  if (nonEmptyStr(b.phone)) score += 10;
  if (nonEmptyArr(b.markets)) score += 15;
  if (nonEmptyArr(b.property_types)) score += 10;
  if (b.price_min != null && b.price_max != null) score += 10;
  if (nonEmptyArr(b.proof_of_funds_files)) score += 15;
  if (nonEmptyStr(b.previous_deals)) score += 10;
  if (nonEmptyStr(b.experience)) score += 10;
  const vetted = b.buyer_status === "vetted" || b.buyer_status === "vetted_and_closed";
  return { score, isComplete: score >= 90 || (vetted && score >= 80) };
}

function archiveCompleteness(b: any): { score: number; isComplete: boolean } {
  let score = 0;
  if (nonEmptyStr(b.full_name) || nonEmptyStr(b.first_name) || nonEmptyStr(b.last_name)) score += 15;
  if (nonEmptyStr(b.email)) score += 15;
  if (nonEmptyStr(b.phone)) score += 10;
  if (nonEmptyArr(b.preferred_markets)) score += 25;
  if (nonEmptyArr(b.property_types)) score += 15;
  if (b.price_min != null && b.price_max != null) score += 10;
  if (nonEmptyStr(b.city) || nonEmptyStr(b.state)) score += 10;
  return { score, isComplete: score >= 85 };
}


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

    // ── Build 4-tier candidate pool from archive_buyers ──
    const cityLc = (ctx.city || "").toLowerCase().trim();
    let stateRaw = (ctx.state || "").trim();
    let stateAbbr = "";
    let stateFull = "";
    if (stateRaw.length === 2 && STATE_FULL[stateRaw.toUpperCase()]) {
      stateAbbr = stateRaw.toUpperCase();
      stateFull = STATE_FULL[stateAbbr];
    } else if (STATE_ABBR[stateRaw.toLowerCase()]) {
      stateFull = stateRaw;
      stateAbbr = STATE_ABBR[stateRaw.toLowerCase()];
    }
    const stateAbbrLc = stateAbbr.toLowerCase();
    const stateFullLc = stateFull.toLowerCase();

    const metroKey = cityLc && stateAbbr ? `${cityLc}, ${stateAbbr.toLowerCase()}` : "";
    const metroCities = METRO_MAP[metroKey] || [];

    // Fetch state-scoped candidates (covers tier 1/2/3 for buyers with state column)
    // plus national/empty buyers (tier 4). Use parallel queries and merge by id.
    const queries: Promise<any>[] = [];
    if (stateFull || stateAbbr) {
      const stateOr = [
        stateFull && `state.ilike.${stateFull}`,
        stateAbbr && `state.ilike.${stateAbbr}`,
      ].filter(Boolean).join(",");
      queries.push(
        admin.from("archive_buyers")
          .select("id, full_name, first_name, last_name, email, phone, preferred_markets, property_types, price_min, price_max, sources, city, state, national")
          .eq("is_active", true).or(stateOr).limit(2000)
      );
    }
    // National flagged buyers
    queries.push(
      admin.from("archive_buyers")
        .select("id, full_name, first_name, last_name, email, phone, preferred_markets, property_types, price_min, price_max, sources, city, state, national")
        .eq("is_active", true).eq("national", true).limit(1000)
    );
    // Undeclared buyers — no state column AND empty preferred_markets. Surface as tier 4
    // so legacy rolodex auto-promoted records (no location data) still appear.
    queries.push(
      admin.from("archive_buyers")
        .select("id, full_name, first_name, last_name, email, phone, preferred_markets, property_types, price_min, price_max, sources, city, state, national")
        .eq("is_active", true).is("state", null).or("preferred_markets.eq.{},preferred_markets.is.null").limit(500)
    );
    // Buyers whose preferred_markets text contains the state name/abbrev or city — catches rows
    // that don't have the state column populated.
    if (cityLc || stateFullLc || stateAbbrLc) {
      const tokens = [cityLc, stateFullLc, stateAbbrLc, ...metroCities].filter(Boolean);
      const orParts = tokens.map((t) => `preferred_markets.cs.{${t}}`).join(",");
      if (orParts) {
        queries.push(
          admin.from("archive_buyers")
            .select("id, full_name, first_name, last_name, email, phone, preferred_markets, property_types, price_min, price_max, sources, city, state, national")
            .eq("is_active", true).or(orParts).limit(1500)
        );
      }
    }

    const [rolodexResp, ...archiveResps] = await Promise.all([
      userId
        ? admin.from("buyers")
            .select("id, name, email, phone, markets, property_types, price_min, price_max, source, company_name")
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

    // Score candidates
    const scored: any[] = [];
    for (const r of seen.values()) {
      const markets: string[] = (r.preferred_markets || []).map((m: string) => String(m).toLowerCase());
      const marketsBlob = markets.join(" | ");
      const rowStateLc = (r.state || "").toLowerCase().trim();
      const rowCityLc = (r.city || "").toLowerCase().trim();

      let score = 0;
      let tier = 0;
      const reasons: string[] = [];

      const stateMatches =
        (stateFullLc && (rowStateLc === stateFullLc || marketsBlob.includes(stateFullLc))) ||
        (stateAbbrLc && (rowStateLc === stateAbbrLc || markets.some((m) => m === stateAbbrLc || m.endsWith(`, ${stateAbbrLc}`) || m.includes(`state:${stateAbbrLc}`))));

      const cityDirect =
        cityLc && (rowCityLc === cityLc ||
          markets.some((m) => m === cityLc || m.startsWith(`${cityLc},`) || m.includes(`city:${cityLc}`)));

      const metroMatch = metroCities.some((mc) => markets.some((m) => m.includes(mc)));

      const isStatewide = STATEWIDE_PHRASES.some((p) => marketsBlob.includes(p));
      const isNational = r.national === true ||
        NATIONAL_KEYWORDS.some((kw) => markets.some((m) => m === kw || m === kw.toUpperCase().toLowerCase())) ||
        markets.includes("all") || markets.includes("any") || markets.includes("anywhere");
      const noMarkets = markets.length === 0;

      if (cityDirect && (stateMatches || !stateFullLc)) {
        tier = 1; score = 95;
        reasons.push(`direct city match: ${ctx.city}`);
      } else if (metroMatch && stateMatches) {
        tier = 2; score = 75;
        reasons.push(`metro area match near ${ctx.city}`);
      } else if (stateMatches && (isStatewide || markets.length === 0 || markets.some((m) => m === stateFullLc || m === stateAbbrLc))) {
        tier = 3; score = 50;
        reasons.push(`statewide buyer in ${stateFull || stateAbbr}`);
      } else if (stateMatches) {
        tier = 3; score = 40;
        reasons.push(`buyer in ${stateFull || stateAbbr}`);
      } else if (isNational) {
        tier = 4; score = 25;
        reasons.push("national/all-markets buyer");
      } else if (noMarkets) {
        tier = 4; score = 15;
        reasons.push("undeclared market preferences");
      } else {
        continue;
      }

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
        score,
        tier,
        reason: reasons.join(", "),
      });
    }

    scored.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    const archiveMatches = scored.slice(0, 60);

    // Rolodex (private buyers) — keep AI ranking, small pool
    const rolodex = (rolodexResp.data || []).map((b: any) => ({
      id: b.id, name: b.name, email: b.email, phone: b.phone,
      markets: b.markets || [], property_types: b.property_types || [],
      price_min: b.price_min, price_max: b.price_max, source: b.source,
    }));
    const rolodexMatches = await rankWithAI(rolodex, address, ctx, propertyType, priceHint, LOVABLE_API_KEY);

    // Optional: AI re-rank top archive candidates within tier 1 only (keep tiers stable)
    // Skipped for now — deterministic order is fine and avoids dropping rows on AI flakiness.

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
    id: b.id, name: b.name, markets: b.markets || [],
    property_types: b.property_types || [],
    price_min: b.price_min, price_max: b.price_max, source: b.source,
  }));

  const sys = `You are a real-estate acquisitions assistant. Given a property and a list of cash buyers, return the top 5 best matches. Be concise.`;
  const userPrompt = `Property: ${address}\nCity: ${ctx.city || ""}, State: ${ctx.state || ""}, Zip: ${ctx.zip || ""}\n${propertyType ? `Type: ${propertyType}\n` : ""}${priceHint ? `Price: ${priceHint}\n` : ""}\nBuyers: ${JSON.stringify(compact)}\nReturn top 5 with score 0-100 and 1-sentence reason each.`;

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
      const byId = new Map(candidates.map((c) => [c.id, c]));
      const mapped = (args.matches || [])
        .map((m: any) => ({ ...byId.get(m.buyer_id), score: m.score, reason: m.reason }))
        .filter((m: any) => m.id);
      if (mapped.length) return mapped;
    }
  } catch (e) { console.error("AI rank error", e); }

  // Fallback deterministic
  return candidates.slice(0, 5).map((c) => ({ ...c, score: 50, reason: "Candidate match" }));
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
