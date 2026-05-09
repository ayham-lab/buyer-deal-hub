// Shared helper: returns a valid GHL access token for a location row, refreshing
// via /oauth/token (grant_type=refresh_token) when expired or near expiry.
// Works for both Company- and Location-scoped tokens (GHL accepts the same flow).
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const GHL_BASE = "https://services.leadconnectorhq.com";

export interface GhlTokenRow {
  ghl_location_id: string;
  ghl_company_id?: string | null;
  access_token: string;
  refresh_token: string;
  expires_at?: string | null;
}

export async function getValidGhlAccessToken(
  admin: SupabaseClient,
  row: GhlTokenRow,
  bufferMs = 60_000,
): Promise<{ access_token: string; refreshed: boolean; error?: string }> {
  const expMs = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (expMs && expMs - Date.now() > bufferMs) {
    return { access_token: row.access_token, refreshed: false };
  }

  const client_id = Deno.env.get("GHL_MARKETPLACE_CLIENT_ID") ?? "";
  const client_secret = Deno.env.get("GHL_MARKETPLACE_CLIENT_SECRET") ?? "";
  if (!client_id || !client_secret) {
    return { access_token: row.access_token, refreshed: false, error: "missing_client_credentials" };
  }

  const form = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "refresh_token",
    refresh_token: row.refresh_token,
  });
  const resp = await fetch(`${GHL_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
  });
  const text = await resp.text();
  if (!resp.ok) {
    console.error("GHL token refresh failed", resp.status, text);
    return { access_token: row.access_token, refreshed: false, error: `refresh ${resp.status}: ${text.slice(0, 300)}` };
  }
  const j = JSON.parse(text);
  const newExpiresAt = new Date(Date.now() + (Number(j.expires_in) || 0) * 1000).toISOString();
  await admin.from("ghl_location_tokens").update({
    access_token: j.access_token,
    refresh_token: j.refresh_token ?? row.refresh_token,
    expires_at: newExpiresAt,
    ghl_company_id: j.companyId ?? j.company_id ?? row.ghl_company_id,
    updated_at: new Date().toISOString(),
  }).eq("ghl_location_id", row.ghl_location_id);

  return { access_token: j.access_token, refreshed: true };
}
