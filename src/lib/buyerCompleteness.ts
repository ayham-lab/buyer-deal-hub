// Shared utility: compute how "complete" a buyer profile is.
// Used by the Buyer Rolodex (UI indicator) and the Finder algorithm (priority boost).

export type BuyerLike = {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  markets?: string[] | null;
  property_types?: string[] | null;
  price_min?: number | null;
  price_max?: number | null;
  proof_of_funds_files?: string[] | null;
  previous_deals?: string | null;
  experience?: string | null;
  buyer_status?: string | null;
};

type Check = { key: string; label: string; weight: number; ok: boolean };

export type BuyerCompleteness = {
  score: number;          // 0-100
  isComplete: boolean;    // score >= 90 AND no critical gaps
  missing: string[];      // human-readable labels of missing items
};

function nonEmptyStr(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}
function nonEmptyArr(v: unknown): boolean {
  return Array.isArray(v) && v.length > 0;
}

export function getBuyerCompleteness(b: BuyerLike): BuyerCompleteness {
  const name = nonEmptyStr(b.name) || nonEmptyStr(b.first_name) || nonEmptyStr(b.last_name);
  const checks: Check[] = [
    { key: "name", label: "Name", weight: 10, ok: name },
    { key: "email", label: "Email", weight: 10, ok: nonEmptyStr(b.email) },
    { key: "phone", label: "Phone", weight: 10, ok: nonEmptyStr(b.phone) },
    { key: "markets", label: "Markets", weight: 15, ok: nonEmptyArr(b.markets) },
    { key: "property_types", label: "Property Types", weight: 10, ok: nonEmptyArr(b.property_types) },
    { key: "price_range", label: "Price Range", weight: 10, ok: (b.price_min != null && b.price_max != null) },
    { key: "proof_of_funds", label: "Proof of Funds", weight: 15, ok: nonEmptyArr(b.proof_of_funds_files) },
    { key: "previous_deals", label: "Previous Deals", weight: 10, ok: nonEmptyStr(b.previous_deals) },
    { key: "experience", label: "Experience", weight: 10, ok: nonEmptyStr(b.experience) },
  ];

  const score = checks.reduce((sum, c) => sum + (c.ok ? c.weight : 0), 0);
  const missing = checks.filter((c) => !c.ok).map((c) => c.label);
  const vetted = b.buyer_status === "vetted" || b.buyer_status === "vetted_and_closed";
  const isComplete = score >= 90 || (vetted && score >= 80);
  return { score, isComplete, missing };
}

// Lite completeness for archive_buyers rows (no PoF/experience/previous_deals).
export function getArchiveBuyerCompleteness(b: {
  full_name?: string | null; first_name?: string | null; last_name?: string | null;
  email?: string | null; phone?: string | null;
  preferred_markets?: string[] | null; property_types?: string[] | null;
  price_min?: number | null; price_max?: number | null;
  city?: string | null; state?: string | null;
}): { score: number; isComplete: boolean } {
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
