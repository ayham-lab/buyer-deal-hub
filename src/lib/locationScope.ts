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
 * Defense-in-depth: explicitly filter a SELECT query by ghl_location_id when
 * an active location is set. RLS enforces this server-side, but adding the
 * filter client-side makes the scope visible in queries and protects against
 * RLS regressions. No-op in standalone mode (returns the query unchanged).
 */
export function scopeToLocation<T>(query: T): T {
  const loc = getActiveLocationId();
  if (!loc) return query;
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

    // Skip edge function calls — they don't enforce per-row RLS scoping
    // (they run with the service role) and adding these custom headers
    // would force a CORS preflight that the functions don't whitelist,
    // silently breaking every functions.invoke() call from the browser.
    if (url.includes("/functions/v1/")) {
      return originalFetch(input, init);
    }

    // Pricing configuration tables are global, not workspace-scoped. If an
    // admin has a workspace selected in standalone mode, forwarding the active
    // location header makes RLS see current_ghl_location() and the admin update
    // policy intentionally matches zero rows. Leave these requests unscoped so
    // pricing edits persist after refresh.
    if (GLOBAL_ADMIN_REST_TABLES.some((table) => url.includes(`/rest/v1/${table}`))) {
      return originalFetch(input, init);
    }

    const loc = getActiveLocationId();
    if (!loc && !isIframed) return originalFetch(input, init);

    const headers = new Headers(init?.headers ?? (input as Request)?.headers);
    if (loc) headers.set("x-ghl-location-id", loc);
    // Belt-and-suspenders: tell the DB this request is from inside the GHL
    // iframe. The DB guard refuses to run if iframe=1 but no location is set.
    if (isIframed) headers.set("x-ghl-iframe", "1");
    return originalFetch(input, { ...(init ?? {}), headers });
  };
}
