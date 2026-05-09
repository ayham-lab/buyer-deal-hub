// Multi-tenant scoping helper.
//
// When the app is opened inside the GoHighLevel iframe, `LocationProvider`
// stores the active sub-account in sessionStorage as `ghl_active_location`.
// We forward that location id to Supabase on every request via the
// `x-ghl-location-id` header. Supabase RLS then enforces per-location
// scoping (see public.current_ghl_location()).
//
// In standalone mode (no iframe → no active location) the header is omitted
// and the user sees all of their data across locations (agency-owner view).

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

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

/**
 * Spread into any insert payload to auto-tag the row with the active
 * location. Returns `{}` in standalone mode so the column stays NULL.
 */
export function withLocation<T extends Record<string, unknown>>(
  payload: T,
): T & { ghl_location_id?: string } {
  const loc = getActiveLocationId();
  return loc ? { ...payload, ghl_location_id: loc } : payload;
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

    const loc = getActiveLocationId();
    if (!loc) return originalFetch(input, init);

    const headers = new Headers(init?.headers ?? (input as Request)?.headers);
    headers.set("x-ghl-location-id", loc);
    return originalFetch(input, { ...(init ?? {}), headers });
  };
}
