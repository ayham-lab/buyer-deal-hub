// Shared caller resolution for team-management edge functions.
// Returns the Supabase auth user_id either from a Bearer JWT (standalone) or
// by decrypting an x-ghl-sso header (iframe) and matching the SSO email to a
// profile. Service-role admin client is required for the email→user lookup.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { decryptGhlSso } from "./ghlSso.ts";
import { findAuthUserIdByEmail } from "./authUsers.ts";

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

    // Identity comes from auth.users, NOT from public.profiles.
    //
    // profiles.email is only a mirror: it has no uniqueness constraint and, until
    // the accompanying migration, any user could rewrite their own row's email.
    // Looking a caller up by profiles.email therefore let one user's SSO session
    // resolve to another user's id. auth.users.email is the authoritative
    // identity and GoTrue enforces its uniqueness, which is why iframe-signin
    // (which already resolves this way) was never affected.
    // NO auto-provisioning here. This used to create an account for any caller
    // presenting a valid SSO blob, which reopened the exact hole the
    // iframe-signin signup gate closes: a user who declined (or never saw) the
    // consent screen still got an account the moment the app called any
    // SSO-authenticated edge function. Unknown callers are rejected; the client
    // sends them through iframe-signin, which shows the opt-in screen.
    const userName: string | null = payload?.userName ?? payload?.name ?? null;
    let userId: string | null = null;
    try {
      userId = await findAuthUserIdByEmail(admin, email);
      if (!userId) {
        return { ok: false, status: 403, error: "signup_required" };
      }
      // Keep the profile mirror present and in sync. Keyed on user_id, never email.
      await admin.from("profiles").upsert(
        { user_id: userId, email, name: userName ?? email },
        { onConflict: "user_id" },
      );
    } catch (e: any) {
      return { ok: false, status: 500, error: `caller_lookup_failed: ${String(e?.message ?? e)}` };
    }

    return {
      ok: true,
      userId: userId!,
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
