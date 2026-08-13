// Mints a real Supabase session for a GHL iframe user authenticated via SSO.
// Flow: decrypt SSO blob -> gate on workspace activation + per-user signup ->
// find or create confirmed auth user -> upsert profile + ghl_location_links
// (trigger fills location_memberships) -> generate magiclink + verify it
// server-side to return access/refresh tokens.
//
// Two consent gates, both of which return early WITHOUT writing anything:
//   needs_activation — the sub-account has no workspace here yet.
//   needs_signup     — the workspace exists but this person has never joined.
// The caller re-invokes with { activate: true } / { signup: true } once the
// user has explicitly opted in from the corresponding screen.

import { createClient } from "npm:@supabase/supabase-js@2";
import { decryptGhlSso } from "../_shared/ghlSso.ts";
import { findAuthUserIdByEmail } from "../_shared/authUsers.ts";
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
    const body = await req.json().catch(() => ({} as any));
    const ssoBlob = req.headers.get("x-ghl-sso") ?? body?.sso;
    const wantsActivation = body?.activate === true;
    // Activating a dormant workspace is itself an explicit opt-in, so it
    // implies consent to create the activating user's account.
    const wantsSignup = body?.signup === true || wantsActivation;
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

    // 0) ACTIVATION GATE — installing the app in a GHL sub-account no longer
    //    creates an account here. The location stays dormant until a real
    //    person opens the iframe and explicitly activates the workspace.
    const { data: tokenRow } = await admin
      .from("ghl_location_tokens")
      .select("activated_at, location_name")
      .eq("ghl_location_id", locationId)
      .maybeSingle();
    const isActivated = !!tokenRow?.activated_at;
    if (!isActivated && !wantsActivation) {
      return json({
        needs_activation: true,
        location_id: locationId,
        location_name: tokenRow?.location_name ?? null,
        company_id: companyId,
        email,
        user_name: userName,
      });
    }


    // 0b) PER-USER SIGNUP GATE — an activated workspace does NOT auto-create an
    //     account for every GHL user who happens to open the iframe. Someone
    //     who has never joined this workspace has to opt in first.
    let userId: string | null = null;
    try {
      userId = await findAuthUserIdByEmail(admin, email);
    } catch (e: any) {
      return json({ error: "list_users_failed", detail: String(e?.message ?? e) }, 500);
    }

    // "Already joined" is evidence of a prior opt-in, which also grandfathers
    // every account created before this gate existed. Links are checked as
    // well as memberships in case a legacy row predates the membership trigger.
    let alreadyJoined = false;
    if (userId) {
      const [{ data: membership }, { data: link }] = await Promise.all([
        admin
          .from("location_memberships")
          .select("user_id")
          .eq("location_id", locationId)
          .eq("user_id", userId)
          .maybeSingle(),
        admin
          .from("ghl_location_links")
          .select("id")
          .eq("ghl_location_id", locationId)
          .eq("user_id", userId)
          .maybeSingle(),
      ]);
      alreadyJoined = !!membership || !!link;
    }

    if (!alreadyJoined && !wantsSignup) {
      return json({
        needs_signup: true,
        location_id: locationId,
        location_name: tokenRow?.location_name ?? null,
        company_id: companyId,
        email,
        user_name: userName,
        has_account: !!userId,
      });
    }

    // 1) Create the auth.users row if this is a brand-new person, so we have a
    //    stable uuid before writing any related rows. Only reachable once the
    //    user has explicitly consented above.
    if (!userId) {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          name: userName ?? email,
          // Distinguishes consented accounts from the legacy auto-provisioned
          // "ghl_iframe_sso" rows that predate this gate.
          source: "ghl_iframe_signup",
        },
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

    // Activation: the person who explicitly activated the workspace becomes
    // the owner when GHL ownership couldn't be resolved. They asked for the
    // account, so there's no orphan/custodian situation to clean up later.
    if (!isActivated && wantsActivation && !ownerId) {
      ownerId = userId;
      ownerSourceDetail = { source: "self_activation", activated_by_email: email };
      queueForReview = null;
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
      if (ownerSourceDetail.source === "ghl_admin_lookup" || ownerSourceDetail.source === "self_activation") {
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

    // Stamp the workspace as activated so future visitors skip the gate.
    if (!isActivated && wantsActivation) {
      await admin.rpc("activate_location", { _location_id: locationId, _user_id: userId });
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
