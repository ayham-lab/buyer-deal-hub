export function parsePrice(hint: string | number | null | undefined): number | null {
  if (hint == null) return null;
  if (typeof hint === "number") return Number.isFinite(hint) && hint > 0 ? hint : null;
  const s = hint.trim().toLowerCase();
  if (!s) return null;
  const m = s.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m) return null;
  let n = Number(m[1]);
  if (m[2] === "k") n *= 1_000;
  if (m[2] === "m") n *= 1_000_000;
  return Number.isFinite(n) && n > 0 ? n : null;
}

const NEAR_MISS_TOLERANCE = 0.15;

export function scorePriceFit(
  price: number | null,
  min: number | null | undefined,
  max: number | null | undefined,
): { points: number; label: string | null } {
  const lo = typeof min === "number" && min > 0 ? min : null;
  const hi = typeof max === "number" && max > 0 ? max : null;
  if (price == null || (lo == null && hi == null)) return { points: 0, label: null };

  if ((lo == null || price >= lo) && (hi == null || price <= hi)) {
    return { points: 12, label: "price fits budget" };
  }
  const nearLo = lo != null && price < lo && price >= lo * (1 - NEAR_MISS_TOLERANCE);
  const nearHi = hi != null && price > hi && price <= hi * (1 + NEAR_MISS_TOLERANCE);
  if (nearLo || nearHi) return { points: 5, label: "near price range" };
  return { points: -8, label: "outside price range" };
}
