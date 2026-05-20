// Smart detection for GHL opportunity field conventions.
//
// Some sub-accounts use opp.name as the homeowner name (Citiflip SMS 2 convention).
// Others use opp.name as the property address (Citiflip MAIN convention).
// This helper detects which convention an opp follows and resolves
// homeowner_name + property_address accordingly.

const STREET_TOKENS = [
  "ave", "avenue", "st", "street", "rd", "road", "blvd", "boulevard",
  "dr", "drive", "ct", "court", "ln", "lane", "way", "pl", "place",
  "hwy", "highway", "pkwy", "parkway", "ter", "terrace", "cir", "circle",
  "trl", "trail", "sq", "square",
];

const STREET_RE = new RegExp(
  `\\b(${STREET_TOKENS.join("|")})\\b\\.?`,
  "i",
);

const STARTS_WITH_NUMBER_RE = /^\s*\d+\s+\S/;

// "ALL CAPS NAME - 3/30/2026" or similar date-suffixed name patterns.
const NAME_DATE_RE = /\s-\s\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/;

export function looksLikeAddress(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = raw.trim();
  if (!s) return false;
  if (NAME_DATE_RE.test(s)) return false;
  return STARTS_WITH_NUMBER_RE.test(s) && STREET_RE.test(s);
}

export function cleanAddress(raw: string): string {
  let s = raw.trim();
  // Strip trailing ", USA" / ", United States"
  s = s.replace(/,\s*(usa|united states)\s*$/i, "");
  // Strip trailing commas / whitespace
  s = s.replace(/[,\s]+$/g, "");
  return s.trim();
}

// "Name - Address" → if part after dash looks like an address, return it.
// Otherwise return null (treat whole string as name).
export function extractAddressAfterDash(raw: string): string | null {
  const idx = raw.indexOf(" - ");
  if (idx < 0) return null;
  const after = raw.slice(idx + 3).trim();
  if (looksLikeAddress(after)) return cleanAddress(after);
  return null;
}

export function composeContactName(contact: any): string | null {
  if (!contact || typeof contact !== "object") return null;
  const fn = (contact.firstName ?? contact.first_name ?? "").toString().trim();
  const ln = (contact.lastName ?? contact.last_name ?? "").toString().trim();
  const composed = [fn, ln].filter(Boolean).join(" ").trim();
  if (composed) return composed;
  const nm = (contact.name ?? "").toString().trim();
  if (nm) return nm;
  const co = (contact.companyName ?? contact.company_name ?? "").toString().trim();
  if (co) return co;
  return null;
}

export interface MappingResolution {
  homeowner_name: string | null;
  property_address: string | null;
  path: "address_in_opp_name" | "name_in_opp_name";
  addressFromOppName: boolean;
}

export interface ResolveInput {
  oppName: string | null | undefined;
  contact: any | null | undefined;
  // Fallback property address (from contact.address fetch) used when oppName is a name.
  contactFormattedAddress: string | null | undefined;
}

export function resolveOppMapping(input: ResolveInput): MappingResolution {
  const rawName = (input.oppName ?? "").toString().trim();

  // Direct address in opp.name
  if (looksLikeAddress(rawName)) {
    return {
      property_address: cleanAddress(rawName),
      homeowner_name: composeContactName(input.contact),
      path: "address_in_opp_name",
      addressFromOppName: true,
    };
  }

  // "Name - Address" pattern: extract address; homeowner_name = portion before dash
  const extracted = extractAddressAfterDash(rawName);
  if (extracted) {
    const beforeDash = rawName.slice(0, rawName.indexOf(" - ")).trim();
    return {
      property_address: extracted,
      homeowner_name: beforeDash || composeContactName(input.contact),
      path: "address_in_opp_name",
      addressFromOppName: true,
    };
  }

  // Default: opp.name is the homeowner, address comes from contact
  return {
    homeowner_name: rawName || composeContactName(input.contact),
    property_address: input.contactFormattedAddress ?? null,
    path: "name_in_opp_name",
    addressFromOppName: false,
  };
}
