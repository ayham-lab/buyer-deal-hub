// Multi-tenant GHL Private Integration Token (PIT) resolver.
//
// Each GHL agency has its own PIT. We store one Supabase secret per agency,
// named `GHL_PIT_<COMPANY_ID>` where <COMPANY_ID> is the agency's `companyId`
// uppercased and stripped of non-alphanumerics (GHL company IDs are already
// alphanumeric, so this is effectively just uppercasing).
//
// Rollout strategy: for one release we keep `GHL_AGENCY_PIT_TOKEN` as a legacy
// fallback so nothing breaks while per-agency secrets are being added. Both
// the fallback path and the fully-missing path emit structured log lines so
// operators can watch for either condition in function logs before removing
// the legacy secret.

export type PitSource = "per_company" | "legacy_fallback" | "missing";

export interface PitLookup {
  token: string | null;
  source: PitSource;
  secretName: string;
}

/**
 * Deterministic secret name for a given companyId. Kept pure so ops can predict
 * the name from a companyId without running code.
 */
export function pitSecretName(companyId: string): string {
  const clean = companyId.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return `GHL_PIT_${clean}`;
}

/**
 * Resolve the PIT to use when calling GHL on behalf of a given agency.
 *
 * - If a per-company secret is set, use it (`source: "per_company"`).
 * - Else if the legacy `GHL_AGENCY_PIT_TOKEN` is set, use it and log a
 *   `legacy_fallback` warning so operators can track pre-rollout traffic.
 * - Else return `token: null` with `source: "missing"` and log an error;
 *   callers soft-fail as they did before.
 *
 * `companyId` is nullable so callers that genuinely don't have one yet (e.g.
 * one-off admin functions defaulting to a hard-coded target) still work — they
 * fall straight to the legacy fallback.
 */
export function getGhlPit(companyId: string | null | undefined): PitLookup {
  if (companyId) {
    const name = pitSecretName(companyId);
    const v = Deno.env.get(name);
    if (v && v.length > 0) {
      return { token: v, source: "per_company", secretName: name };
    }
  }
  const legacy = Deno.env.get("GHL_AGENCY_PIT_TOKEN");
  if (legacy && legacy.length > 0) {
    console.warn(
      "ghl_pit legacy_fallback",
      JSON.stringify({ companyId: companyId ?? null }),
    );
    return {
      token: legacy,
      source: "legacy_fallback",
      secretName: "GHL_AGENCY_PIT_TOKEN",
    };
  }
  console.error(
    "ghl_pit missing",
    JSON.stringify({
      companyId: companyId ?? null,
      expected: companyId ? pitSecretName(companyId) : "GHL_AGENCY_PIT_TOKEN",
    }),
  );
  return {
    token: null,
    source: "missing",
    secretName: companyId ? pitSecretName(companyId) : "GHL_AGENCY_PIT_TOKEN",
  };
}
