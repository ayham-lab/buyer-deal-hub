import type { CanonicalPropertyType } from "./types.ts";

const CANONICAL: CanonicalPropertyType[] = ["SFH", "MFH 2-4", "MFH 5+", "Commercial", "Land", "Mobile"];

const SFH_RE = /\bsfh\b|\bsfr\b|single[\s-]?fam|\bhouse\b|townhome|townhouse|\bcondo\b|residential/;
const MFH_SMALL_RE = /duplex|triplex|quadplex|fourplex|2\s*(?:-|to)\s*4|small\s*multi/;
const MFH_LARGE_RE = /5\s*\+|apartment|large\s*multi/;
const MFH_GENERIC_RE = /multi[\s-]?family|\bmfh\b/;
const COMMERCIAL_RE = /commercial|retail|office|industrial|mixed[\s-]?use/;
const LAND_RE = /\bland\b|\blots?\b|vacant|acre/;
const MOBILE_RE = /mobile|manufactured|trailer|\bmh\b/;

export function normalizePropertyTypes(raw: string[] | null | undefined): Set<CanonicalPropertyType> {
  const out = new Set<CanonicalPropertyType>();
  for (const r of raw || []) {
    const s = String(r ?? "").trim();
    if (!s) continue;
    const exact = CANONICAL.find((c) => c.toLowerCase() === s.toLowerCase());
    if (exact) { out.add(exact); continue; }
    const lc = s.toLowerCase();
    if (SFH_RE.test(lc)) out.add("SFH");
    const small = MFH_SMALL_RE.test(lc);
    const large = MFH_LARGE_RE.test(lc);
    if (small) out.add("MFH 2-4");
    if (large) out.add("MFH 5+");
    // Generic "multifamily" with no unit count could mean either bucket
    if (!small && !large && MFH_GENERIC_RE.test(lc)) { out.add("MFH 2-4"); out.add("MFH 5+"); }
    if (COMMERCIAL_RE.test(lc)) out.add("Commercial");
    if (LAND_RE.test(lc)) out.add("Land");
    if (MOBILE_RE.test(lc)) out.add("Mobile");
  }
  return out;
}
