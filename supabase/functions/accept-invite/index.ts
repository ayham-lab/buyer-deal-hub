// Authenticated: accept a pending invite. Verifies the token, ensures the
// signed-in user's email matches the invite (case-insensitive), inserts a
// member-level location_memberships row, and marks the invite accepted.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const token = String(body.token ?? "");
    if (!token) return json({ error: "missing_token" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: invite } = await admin
      .from("pending_invites")
      .select("id, location_id, email, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();
    if (!invite) return json({ error: "not_found" }, 404);
    if (invite.accepted_at) return json({ error: "already_accepted" }, 410);
    if (new Date(invite.expires_at).getTime() < Date.now()) return json({ error: "expired" }, 410);

    if ((user.email ?? "").toLowerCase() !== invite.email.toLowerCase()) {
      return json({ error: "email_mismatch", invite_email: invite.email }, 403);
    }

    // Insert membership (idempotent via unique constraint).
    const { error: insErr } = await admin
      .from("location_memberships")
      .insert({
        location_id: invite.location_id,
        user_id: user.id,
        role: "member",
        is_owner: false,
      });
    // 23505 = unique_violation; treat as "already a member" (still mark accepted).
    if (insErr && (insErr as any).code !== "23505") {
      return json({ error: insErr.message }, 500);
    }

    await admin
      .from("pending_invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    return json({ ok: true, location_id: invite.location_id });
  } catch (e: any) {
    return json({ error: e?.message ?? "unexpected_error" }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
