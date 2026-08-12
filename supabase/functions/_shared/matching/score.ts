import type { BuyerFacts, MatchResult, PropertyQuery } from "./types.ts";
import { geoTier, parseGeoPrefs } from "./geo.ts";
import { normalizePropertyTypes } from "./propertyTypes.ts";
import { scorePriceFit } from "./price.ts";

function nonEmptyStr(v: unknown): boolean { return typeof v === "string" && v.trim().length > 0; }
function nonEmptyArr(v: unknown): boolean { return Array.isArray(v) && v.length > 0; }

// Mirrors src/lib/buyerCompleteness.ts (rolodex buyers)
export function rolodexCompleteness(b: any): { score: number; isComplete: boolean } {
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

export function archiveCompleteness(b: any): { score: number; isComplete: boolean } {
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

export function archiveBuyerToFacts(row: any): BuyerFacts {
  const comp = archiveCompleteness(row);
  const rawTypes = row.property_types || [];
  return {
    geo: parseGeoPrefs({
      markets: row.preferred_markets,
      preferredZips: row.preferred_zips,
      rowCity: row.city,
      rowState: row.state,
      national: row.national,
    }),
    propertyTypes: normalizePropertyTypes(rawTypes),
    hasDeclaredTypes: rawTypes.length > 0,
    priceMin: row.price_min ?? null,
    priceMax: row.price_max ?? null,
    status: row.status ?? null,
    activity: row.buyer_activity ?? null,
    completedTransaction: row.completed_transaction === true,
    dealsPurchased: row.system_deals_purchased ?? 0,
    completeness: comp.score,
    profileComplete: comp.isComplete,
  };
}

export function rolodexBuyerToFacts(row: any): BuyerFacts {
  const comp = rolodexCompleteness(row);
  const rawTypes = [
    ...(row.property_types || []),
    ...(nonEmptyStr(row.other_property_type) ? [row.other_property_type] : []),
  ];
  return {
    geo: parseGeoPrefs({ markets: row.markets }),
    propertyTypes: normalizePropertyTypes(rawTypes),
    hasDeclaredTypes: rawTypes.length > 0,
    priceMin: row.price_min ?? null,
    priceMax: row.price_max ?? null,
    status: row.buyer_status ?? null,
    activity: row.buyer_activity ?? null,
    completedTransaction: (row.deals_purchased ?? 0) > 0,
    dealsPurchased: row.deals_purchased ?? 0,
    completeness: comp.score,
    profileComplete: comp.isComplete,
  };
}

const PROVEN_STATUSES = new Set(["vetted_and_closed", "repeat", "recurring"]);

export function scoreBuyer(q: PropertyQuery, f: BuyerFacts): MatchResult {
  const geo = geoTier(q, f.geo);
  if (geo.dropped) return { score: 0, tier: geo.tier, reason: "", dropped: true };

  const labels: string[] = [geo.label];

  const price = scorePriceFit(q.price, f.priceMin, f.priceMax);
  if (price.label) labels.push(price.label);

  let typeFit = 0;
  if (q.propertyType) {
    if (f.propertyTypes.has(q.propertyType)) {
      typeFit = 10;
      labels.push(`buys ${q.propertyType}`);
    } else if (f.hasDeclaredTypes) {
      typeFit = -6;
      labels.push("different property focus");
    }
  }

  let quality = 0;
  if (f.status && PROVEN_STATUSES.has(f.status)) { quality += 6; labels.push("proven closer"); }
  else if (f.status === "vetted") { quality += 3; labels.push("vetted buyer"); }
  if (f.completedTransaction) quality += 2;
  if (f.dealsPurchased >= 3) { quality += 4; labels.push(`${f.dealsPurchased} deals bought`); }
  else if (f.dealsPurchased >= 1) { quality += 2; labels.push(`${f.dealsPurchased} deal${f.dealsPurchased > 1 ? "s" : ""} bought`); }
  if (f.activity === "inactive" || f.activity === "not_buying_now") { quality -= 10; labels.push("not currently buying"); }
  else if (f.activity === "uncertain") quality -= 2;
  quality = Math.max(-12, Math.min(10, quality));

  const completenessBoost = Math.round((f.completeness / 100) * 6);

  const score = Math.max(0, Math.min(100, geo.base + price.points + typeFit + quality + completenessBoost));
  const reason = f.profileComplete
    ? `${labels.join(", ")} · complete profile`
    : labels.join(", ");
  return { score, tier: geo.tier, reason, dropped: false };
}
