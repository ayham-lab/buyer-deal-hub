import type { GeoPref, PropertyQuery } from "./types.ts";

// US state abbrev <-> full name
export const STATE_FULL: Record<string, string> = {
  AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"
};
export const STATE_ABBR: Record<string, string> = Object.fromEntries(
  Object.entries(STATE_FULL).map(([k, v]) => [v.toLowerCase(), k])
);

// Best-effort metro/proximity map keyed by "city, ST" → nearby cities (lowercase)
export const METRO_MAP: Record<string, string[]> = {
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

export const NATIONAL_KEYWORDS = ["all","any","anywhere","national","nationwide","everywhere","usa","u.s.","united states","open","flexible"];
export const STATEWIDE_PHRASES = ["any in the state","anywhere in the state","entire state","whole state","statewide","state wide","all over"];

export function normalizeState(raw: string | null | undefined): { abbr: string; full: string } {
  const s = (raw || "").trim();
  if (!s) return { abbr: "", full: "" };
  if (s.length === 2 && STATE_FULL[s.toUpperCase()]) {
    const abbr = s.toUpperCase();
    return { abbr, full: STATE_FULL[abbr] };
  }
  const abbr = STATE_ABBR[s.toLowerCase()];
  if (abbr) return { abbr, full: STATE_FULL[abbr] };
  return { abbr: "", full: "" };
}

function asZip(v: unknown): string | null {
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{4,5})(?:-\d{4})?$/);
  if (!m) return null;
  return m[1].padStart(5, "0");
}

/** Parse a "place, state" string; returns null when no valid state suffix. */
function splitPlaceState(s: string): { place: string; abbr: string } | null {
  const idx = s.lastIndexOf(",");
  if (idx === -1) return null;
  const place = s.slice(0, idx).trim();
  const { abbr } = normalizeState(s.slice(idx + 1));
  if (!place || !abbr) return null;
  return { place, abbr: abbr.toLowerCase() };
}

export function parseGeoPrefs(input: {
  markets: string[] | null | undefined;
  preferredZips?: unknown;
  rowCity?: string | null;
  rowState?: string | null;
  national?: boolean | null;
}): GeoPref {
  const g: GeoPref = {
    zips: new Set(),
    cityStates: new Set(),
    cities: new Set(),
    counties: new Set(),
    states: new Set(),
    statewide: false,
    national: input.national === true,
    empty: false,
  };

  const tokens = (input.markets || [])
    .map((m) => String(m ?? "").toLowerCase().trim())
    .filter(Boolean);
  const blob = tokens.join(" | ");

  if (STATEWIDE_PHRASES.some((p) => blob.includes(p))) g.statewide = true;
  // Multi-word national keywords are matched inside the blob; single words only as exact tokens
  // so a city named e.g. "openville" is not misread as national.
  if (NATIONAL_KEYWORDS.filter((k) => k.includes(" ") || k.includes(".")).some((k) => blob.includes(k))) {
    g.national = true;
  }

  for (const t of tokens) {
    if (NATIONAL_KEYWORDS.includes(t)) { g.national = true; continue; }
    if (STATEWIDE_PHRASES.some((p) => t.includes(p))) continue;

    const prefixed = t.match(/^(city|county|zip|state)\s*:\s*(.*)$/);
    const kind = prefixed?.[1];
    const rest = (prefixed?.[2] ?? t).trim();
    if (!rest) continue;

    if (kind === "zip") {
      const z = asZip(rest);
      if (z) g.zips.add(z);
      continue;
    }
    if (kind === "state") {
      const { abbr } = normalizeState(rest);
      if (abbr) g.states.add(abbr.toLowerCase());
      continue;
    }
    if (kind === "county") {
      const ps = splitPlaceState(rest);
      if (ps) g.counties.add(`${ps.place}|${ps.abbr}`);
      else g.counties.add(`${rest}|`);
      continue;
    }
    if (kind === "city") {
      const ps = splitPlaceState(rest);
      if (ps) { g.cityStates.add(`${ps.place}|${ps.abbr}`); g.cities.add(ps.place); }
      else g.cities.add(rest);
      continue;
    }

    // Unprefixed token
    const z = asZip(rest);
    if (z) { g.zips.add(z); continue; }
    const st = normalizeState(rest);
    if (st.abbr) { g.states.add(st.abbr.toLowerCase()); continue; }
    const ps = splitPlaceState(rest);
    if (ps) {
      g.cityStates.add(`${ps.place}|${ps.abbr}`);
      g.cities.add(ps.place);
      g.states.add(ps.abbr);
      continue;
    }
    g.cities.add(rest);
  }

  if (Array.isArray(input.preferredZips)) {
    for (const z of input.preferredZips) {
      const zz = asZip(z);
      if (zz) g.zips.add(zz);
    }
  }

  // Buyer's home base counts as a geographic preference (matches prior behavior)
  const rowCity = (input.rowCity || "").toLowerCase().trim();
  const rowSt = normalizeState(input.rowState);
  if (rowSt.abbr) g.states.add(rowSt.abbr.toLowerCase());
  if (rowCity) {
    g.cities.add(rowCity);
    if (rowSt.abbr) g.cityStates.add(`${rowCity}|${rowSt.abbr.toLowerCase()}`);
  }

  g.empty =
    g.zips.size === 0 && g.cityStates.size === 0 && g.cities.size === 0 &&
    g.counties.size === 0 && g.states.size === 0 && !g.statewide && !g.national;
  return g;
}

export function geoTier(
  q: PropertyQuery,
  g: GeoPref,
): { tier: 1 | 2 | 3 | 4; base: number; label: string; dropped: boolean } {
  const cityLc = q.city.toLowerCase().trim();
  const stateLc = q.stateAbbr.toLowerCase();
  const stateMatch = !!stateLc && g.states.has(stateLc);

  if (q.zip && g.zips.has(q.zip)) {
    return { tier: 1, base: 62, label: `zip match ${q.zip}`, dropped: false };
  }
  if (cityLc) {
    const cityStateHit = !!stateLc && g.cityStates.has(`${cityLc}|${stateLc}`);
    const bareCityHit = g.cities.has(cityLc) &&
      (!stateLc || g.states.size === 0 || g.states.has(stateLc));
    if (cityStateHit || bareCityHit) {
      return { tier: 1, base: 58, label: `direct city match: ${q.city}`, dropped: false };
    }
  }
  // Bare-city metro hits require state compatibility — metro city names (e.g. "aurora")
  // repeat across states; a "city|st" pair already encodes it.
  const metroHit = q.metroCities.some((mc) =>
    (!!stateLc && g.cityStates.has(`${mc}|${stateLc}`)) ||
    (g.cities.has(mc) && (stateMatch || g.states.size === 0))
  );
  const countyHit = !!stateLc &&
    [...g.counties].some((c) => c.endsWith(`|${stateLc}`));
  if (metroHit || countyHit) {
    return { tier: 2, base: 46, label: `metro area match near ${q.city || q.stateAbbr}`, dropped: false };
  }
  if (stateMatch && g.statewide) {
    return { tier: 3, base: 36, label: `statewide buyer in ${q.stateFull || q.stateAbbr}`, dropped: false };
  }
  if (stateMatch) {
    return { tier: 3, base: 30, label: `buyer in ${q.stateFull || q.stateAbbr}`, dropped: false };
  }
  if (g.national) {
    return { tier: 4, base: 18, label: "national/all-markets buyer", dropped: false };
  }
  if (g.empty) {
    return { tier: 4, base: 10, label: "undeclared market preferences", dropped: false };
  }
  return { tier: 4, base: 0, label: "", dropped: true };
}
