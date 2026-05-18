// Shared caller resolution for team-management edge functions.
// Returns the Supabase auth user_id either from a Bearer JWT (standalone) or
// by decrypting an x-ghl-sso header (iframe) and matching the SSO email to a
// profile. Service-role admin client is required for the email→user lookup.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptGhlSso } from "./ghlSso.ts";

export type ResolvedCaller =
  | { ok: true; userId: string; viaIframe: boolean; ssoLocationId: string | null; email: string | null }
  | { ok: false; status: number; error: string };

export async function resolveCaller(req: Request, admin: SupabaseClient): Promise<ResolvedCaller> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const ssoHeader = req.headers.get("x-ghl-sso") ?? "";

  // PRIORITY: x-ghl-sso wins over Bearer auth. In iframe context the parent
  // browser's standalone Supabase session leaks into the iframe's fetch as a
  // Bearer JWT (different user entirely — e.g. a super_admin viewing a tenant
  // iframe). The SSO blob is the only trustworthy iframe identity signal.
  if (ssoHeader) {
    const sharedSecret = Deno.env.get("GHL_APP_SSO_KEY");
    if (!sharedSecret) return { ok: false, status: 500, error: "GHL_APP_SSO_KEY not configured" };
    let payload: any;
    try {
      payload = await decryptGhlSso(ssoHeader, sharedSecret);
    } catch (e: any) {
      return { ok: false, status: 401, error: `sso_decrypt_failed: ${String(e?.message ?? e)}` };
    }
    const email = String(payload?.email ?? "").trim().toLowerCase();
    if (!email) return { ok: false, status: 401, error: "sso_missing_email" };
    const { data: prof } = await admin
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();
    if (!prof?.user_id) return { ok: false, status: 403, error: "sso_user_not_provisioned" };
    return {
      ok: true,
      userId: prof.user_id,
      viaIframe: true,
      ssoLocationId: payload?.activeLocation || payload?.locationId || null,
      email,
    };
  }

  // Standalone path: Bearer JWT.
  if (authHeader.startsWith("Bearer ") && authHeader.length > 16) {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (!error && user) {
      return { ok: true, userId: user.id, viaIframe: false, ssoLocationId: null, email: user.email ?? null };
    }
  }

  return { ok: false, status: 401, error: "unauthorized" };
}
