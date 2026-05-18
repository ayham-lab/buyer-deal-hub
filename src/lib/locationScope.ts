// Multi-tenant scoping helper.
//
// When the app is opened inside the GoHighLevel iframe, `LocationProvider`
// stores the active sub-account in sessionStorage as `ghl_active_location`.
// We forward that location id to Supabase on every request via the
// `x-ghl-location-id` header. Supabase RLS then enforces per-location
// scoping (see public.current_ghl_location()).
//
// Operator Accounts: if the active location belongs to an operator_account,
// LocationProvider also caches `ghl_effective_locations` (array of every
// location id in the group). scopeToLocation() then uses `.in(...)` so
// queries return aggregated rows across the whole group. RLS still
// authorizes via `location_in_active_group()`.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const GLOBAL_ADMIN_REST_TABLES = [
  "credit_packs",
  "subscription_plans",
  "credit_action_costs",
];

export function getActiveLocationId(): string | null {
  try {
    const raw = sessionStorage.getItem("ghl_active_location");
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.locationId === "string" && parsed.locationId.length > 0
      ? parsed.locationId
      : null;
  } catch {
    return null;
  }
}

/** Effective location ids — full operator-group set, or [activeLocation], or null. */
export function getEffectiveLocationIds(): string[] | null {
  try {
    const raw = sessionStorage.getItem("ghl_effective_locations");
    if (!raw) return null;
    const arr = JSON.parse(raw);
    if (Array.isArray(arr) && arr.length > 0) return arr.filter((x) => typeof x === "string");
    return null;
  } catch {
    return null;
  }
}

/** Cached map of location_id → display name for badges. */
export function getLocationNamesMap(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem("ghl_location_names");
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/**
 * Spread into any insert payload to auto-tag the row with the active
 * location. Returns `{}` in standalone mode so the column stays NULL.
 * Inserts always belong to the active location (not the whole group).
 */
export function withLocation<T extends Record<string, unknown>>(
  payload: T,
): T & { ghl_location_id?: string } {
  const loc = getActiveLocationId();
  return loc ? { ...payload, ghl_location_id: loc } : payload;
}

/**
 * Defense-in-depth filter. If the active location is in an operator group
 * with siblings, expands to `.in()` over every id in the group; otherwise
 * `.eq(activeLocation)`. No-op in standalone.
 */
export function scopeToLocation<T>(query: T): T {
  const loc = getActiveLocationId();
  if (!loc) return query;
  const effective = getEffectiveLocationIds();
  if (effective && effective.length > 1) {
    return (query as any).in("ghl_location_id", effective);
  }
  return (query as any).eq("ghl_location_id", loc);
}

/**
 * Patches global fetch ONCE so every request to the Supabase REST/Auth/
 * Functions endpoints carries `x-ghl-location-id` when an active location
 * is set. Safe to call multiple times — only patches on first call.
 */
let installed = false;
export function installLocationHeader() {
  if (installed) return;
  installed = true;
  if (!SUPABASE_URL) return;
  const supabaseHost = (() => {
    try {
      return new URL(SUPABASE_URL).host;
    } catch {
      return null;
    }
  })();
  if (!supabaseHost) return;

  const isIframed = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    let url: string | null = null;
    try {
      url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
    } catch {
      url = null;
    }

    if (!url || !url.includes(supabaseHost)) {
      return originalFetch(input, init);
    }

    if (url.includes("/functions/v1/")) {
      return originalFetch(input, init);
    }

    if (GLOBAL_ADMIN_REST_TABLES.some((table) => url.includes(`/rest/v1/${table}`))) {
      return originalFetch(input, init);
    }

    const loc = getActiveLocationId();
    if (!loc && !isIframed) return originalFetch(input, init);

    const headers = new Headers(init?.headers ?? (input as Request)?.headers);
    if (loc) headers.set("x-ghl-location-id", loc);
    if (isIframed) headers.set("x-ghl-iframe", "1");
    return originalFetch(input, { ...(init ?? {}), headers });
  };
}
