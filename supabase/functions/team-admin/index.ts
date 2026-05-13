// team-admin: handles team-management actions for both standalone (Bearer JWT)
// and iframe (x-ghl-sso header) auth modes.
// Actions: list, remove_member, revoke_invite.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { resolveCaller } from "../_shared/resolveCaller.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-ghl-sso",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const caller = await resolveCaller(req, admin);
    if (!caller.ok) return j({ error: caller.error }, caller.status);
    const { userId } = caller;

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? "");
    const location_id = String(body.location_id ?? "").trim();
    if (!action || !location_id) return j({ error: "missing_action_or_location" }, 400);

    // Authorization: must be owner of the location OR super_admin.
    const { data: ownerRow } = await admin
      .from("location_memberships")
      .select("id, is_owner")
      .eq("location_id", location_id)
      .eq("user_id", userId)
      .maybeSingle();
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();
    const isOwner = !!ownerRow?.is_owner;
    const isSuper = !!roleRow;
    const canManage = isOwner || isSuper;
    // For 'list' we additionally allow plain members (read-only); UI hides
    // mutating controls based on the returned `is_owner` flag.
    const isMember = !!ownerRow;
    if (action === "list") {
      if (!canManage && !isMember) return j({ error: "forbidden" }, 403);
    } else {
      if (!canManage) return j({ error: "forbidden_not_owner" }, 403);
    }

    if (action === "list") {
      const { data: members } = await admin
        .from("location_memberships")
        .select("id, user_id, role, is_owner, joined_at")
        .eq("location_id", location_id)
        .order("is_owner", { ascending: false });
      const list = members ?? [];
      const userIds = list.map((x: any) => x.user_id);
      const profMap = new Map<string, any>();
      if (userIds.length) {
        const { data: profs } = await admin
          .from("profiles")
          .select("user_id, email, name")
          .in("user_id", userIds);
        (profs ?? []).forEach((p: any) => profMap.set(p.user_id, p));
      }
      const enriched = list.map((m: any) => {
        const p = profMap.get(m.user_id);
        return { ...m, email: p?.email ?? null, name: p?.name ?? null };
      });
      const { data: invites } = await admin
        .from("pending_invites")
        .select("id, email, expires_at, accepted_at, created_at")
        .eq("location_id", location_id)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      return j({
        ok: true,
        members: enriched,
        invites: invites ?? [],
        viewer_user_id: userId,
        viewer_is_owner: isOwner || isSuper,
      });
    }

    if (action === "remove_member") {
      const member_id = String(body.member_id ?? "").trim();
      if (!member_id) return j({ error: "missing_member_id" }, 400);
      // Confirm the row belongs to this location to prevent cross-tenant deletes.
      const { data: row } = await admin
        .from("location_memberships")
        .select("id, is_owner")
        .eq("id", member_id)
        .eq("location_id", location_id)
        .maybeSingle();
      if (!row) return j({ error: "not_found" }, 404);
      if (row.is_owner) return j({ error: "cannot_remove_owner" }, 400);
      const { error: delErr } = await admin
        .from("location_memberships")
        .delete()
        .eq("id", member_id);
      if (delErr) return j({ error: delErr.message }, 500);
      return j({ ok: true });
    }

    if (action === "revoke_invite") {
      const invite_id = String(body.invite_id ?? "").trim();
      if (!invite_id) return j({ error: "missing_invite_id" }, 400);
      const { error: delErr } = await admin
        .from("pending_invites")
        .delete()
        .eq("id", invite_id)
        .eq("location_id", location_id);
      if (delErr) return j({ error: delErr.message }, 500);
      return j({ ok: true });
    }

    return j({ error: "unknown_action" }, 400);
  } catch (e: any) {
    return j({ error: e?.message ?? "unexpected_error" }, 500);
  }
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
