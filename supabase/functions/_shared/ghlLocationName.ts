// Helpers for resolving a sub-account's display name from GHL.
const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

export interface NameResolution {
  name: string | null;
  source: "name" | "business_name" | "city_state" | "none" | "fetch_failed";
  detail?: string;
}

// Extract a usable display name from any GHL location-shaped object
// (returned by /locations/{id}, /oauth/installedLocations, OAuth payloads, etc.)
export function extractLocationName(loc: any): NameResolution {
  if (!loc || typeof loc !== "object") return { name: null, source: "none" };
  const direct = loc.name ?? loc.locationName ?? null;
  if (direct && String(direct).trim()) return { name: String(direct).trim(), source: "name" };
  const biz = loc.business?.name ?? loc.businessName ?? null;
  if (biz && String(biz).trim()) return { name: String(biz).trim(), source: "business_name" };
  const city = loc.address?.city ?? loc.city ?? null;
  const state = loc.address?.state ?? loc.state ?? null;
  if (city && state) return { name: `${city}, ${state}`, source: "city_state" };
  if (city) return { name: String(city), source: "city_state" };
  return { name: null, source: "none" };
}

// Fetch a location from GHL using the agency PIT (preferred) and resolve a name.
export async function fetchAndResolveLocationName(
  locationId: string,
  pitToken: string,
): Promise<NameResolution> {
  try {
    const resp = await fetch(`${GHL_BASE}/locations/${encodeURIComponent(locationId)}`, {
      headers: {
        Authorization: `Bearer ${pitToken}`,
        Accept: "application/json",
        Version: GHL_API_VERSION,
      },
    });
    const text = await resp.text();
    if (!resp.ok) {
      return { name: null, source: "fetch_failed", detail: `${resp.status}: ${text.slice(0, 200)}` };
    }
    let j: any;
    try { j = JSON.parse(text); } catch { return { name: null, source: "fetch_failed", detail: "bad_json" }; }
    return extractLocationName(j.location ?? j);
  } catch (e: any) {
    return { name: null, source: "fetch_failed", detail: e?.message ?? "err" };
  }
}
