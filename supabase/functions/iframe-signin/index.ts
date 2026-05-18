// Mints a real Supabase session for a GHL iframe user authenticated via SSO.
// Flow: decrypt SSO blob -> find or auto-create confirmed auth user ->
// upsert profile + ghl_location_links (trigger fills location_memberships) ->
// generate magiclink + verify it server-side to return access/refresh tokens.

import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptGhlSso } from "../_shared/ghlSso.ts";
import { resolveGhlAdminForLocation, ghlUserDisplayName, provisionAuthUserByEmail } from "../_shared/ghlOwnership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-sso",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ssoBlob = req.headers.get("x-ghl-sso") ?? (await req.json().catch(() => ({}))).sso;
    if (!ssoBlob || typeof ssoBlob !== "string") {
      return json({ error: "missing_sso" }, 400);
    }

    const ssoKey = Deno.env.get("GHL_APP_SSO_KEY");
    if (!ssoKey) return json({ error: "sso_key_not_configured" }, 500);

    let payload: any;
    try {
      payload = await decryptGhlSso(ssoBlob, ssoKey);
    } catch (e) {
      return json({ error: "sso_decrypt_failed", detail: String(e) }, 401);
    }

    const email: string | undefined = payload?.email?.toLowerCase?.();
    const locationId: string | undefined = payload?.activeLocation || payload?.locationId;
    const companyId: string | null = payload?.companyId ?? null;
    const userName: string | null = payload?.userName ?? null;
    if (!email || !locationId) {
      return json({ error: "sso_missing_fields" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    // 1) Find or create the auth.users row FIRST so we have a stable uuid
    //    before writing any related rows.
    let userId: string | null = null;
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 200,
    });
    if (listErr) return json({ error: "list_users_failed", detail: listErr.message }, 500);
    const existing = list?.users?.find((u) => u.email?.toLowerCase() === email);
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { name: userName ?? email, source: "ghl_iframe_sso" },
      });
      if (createErr || !created?.user) {
        return json({ error: "create_user_failed", detail: createErr?.message }, 500);
      }
      userId = created.user.id;
    }

    // 2) Upsert profile (handle_new_user trigger usually does this, but be
    //    defensive in case the trigger didn't run for service-role inserts).
    await admin
      .from("profiles")
      .upsert(
        {
          user_id: userId,
          email,
          name: userName ?? email,
          ghl_location_id: locationId,
          ghl_user_id: payload?.userId ?? null,
        },
        { onConflict: "user_id" },
      );

    // 3) Resolve workspace owner via GHL truth (PIT lookup), not first-visitor.
    //    Behavior:
    //      - existing link row → keep its workspace_owner_user_id
    //      - GHL has a clear admin → owner = that admin's user (auto-provision)
    //      - GHL has no admin or unresolved → owner = null, queue for review,
    //        and insert SSO user as a plain member
    const { data: existingLink } = await admin
      .from("ghl_location_links")
      .select("workspace_owner_user_id")
      .eq("ghl_location_id", locationId)
      .not("workspace_owner_user_id", "is", null)
      .limit(1)
      .maybeSingle();

    let ownerId: string | null = existingLink?.workspace_owner_user_id ?? null;
    let ownerSourceDetail: Record<string, unknown> = { source: "existing_link" };
    let queueForReview: { reason: string; snapshot: unknown } | null = null;

    if (!ownerId && companyId) {
      const verdict = await resolveGhlAdminForLocation(companyId, locationId);
      if (verdict.verdict === "admin") {
        const adminUser = verdict.user;
        const provisioned = await provisionAuthUserByEmail(
          admin,
          adminUser.email,
          ghlUserDisplayName(adminUser),
          adminUser.id,
        );
        if (provisioned) {
          ownerId = provisioned;
          ownerSourceDetail = {
            source: "ghl_admin_lookup",
            ghl_admin_user_id: adminUser.id,
            ghl_admin_email: adminUser.email,
          };
        } else {
          queueForReview = { reason: "ghl_admin_no_email", snapshot: adminUser };
        }
      } else if (verdict.verdict === "no_admin") {
        queueForReview = { reason: "no_ghl_admin", snapshot: null };
      } else if (verdict.verdict === "unresolved") {
        queueForReview = { reason: "multiple_unresolved", snapshot: verdict.admins };
      } else {
        // fetch_failed: do NOT silently make the SSO user owner. Queue for review.
        queueForReview = { reason: `fetch_failed: ${verdict.detail.slice(0, 200)}`, snapshot: null };
      }
    } else if (!ownerId && !companyId) {
      queueForReview = { reason: "no_company_id_in_sso", snapshot: null };
    }

    // Insert link row. If we have an owner, the trigger upserts membership as
    // owner (when user_id === workspace_owner_user_id) or member (otherwise).
    // If we don't have an owner yet, we still create a member-only membership
    // row so the SSO user can use the app.
    if (ownerId) {
      await admin
        .from("ghl_location_links")
        .upsert(
          {
            user_id: userId,
            workspace_owner_user_id: ownerId,
            linked_by_user_id: userId,
            ghl_location_id: locationId,
            ghl_company_id: companyId,
            ghl_location_name: null,
          },
          { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true },
        );
      // Audit only when this call is the one that established ownership.
      if (ownerSourceDetail.source === "ghl_admin_lookup") {
        await admin.from("ownership_audit_log").insert({
          location_id: locationId,
          action: "insert",
          old_owner_user_id: null,
          new_owner_user_id: ownerId,
          ghl_admin_user_id: ownerSourceDetail.ghl_admin_user_id ?? null,
          ghl_admin_email: ownerSourceDetail.ghl_admin_email ?? null,
          executed_by: "iframe-signin",
          detail: ownerSourceDetail,
        });
      }
    } else {
      // Member-only insert; SSO user gets access but is not owner.
      await admin.from("location_memberships").upsert(
        { location_id: locationId, user_id: userId, role: "member", is_owner: false },
        { onConflict: "location_id,user_id" },
      );
      if (queueForReview) {
        await admin.from("manual_review_queue").upsert(
          {
            location_id: locationId,
            ghl_company_id: companyId,
            reason: queueForReview.reason,
            current_owner_user_id: null,
            ghl_users_snapshot: queueForReview.snapshot ?? null,
            status: "pending",
          },
          { onConflict: "location_id", ignoreDuplicates: true },
        );
        await admin.from("ownership_audit_log").insert({
          location_id: locationId,
          action: "queue_manual",
          executed_by: "iframe-signin",
          detail: { reason: queueForReview.reason },
        });
      }
    }

    // 4) Mint a session: generate a magiclink, then verify it to get tokens.
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      return json({ error: "generate_link_failed", detail: linkErr?.message }, 500);
    }

    const verifyClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: verified, error: verifyErr } = await verifyClient.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });
    if (verifyErr || !verified?.session) {
      return json({ error: "verify_otp_failed", detail: verifyErr?.message }, 500);
    }

    return json({
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      user_id: userId,
      location_id: locationId,
    });
  } catch (e) {
    return json({ error: "unhandled", detail: String(e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
