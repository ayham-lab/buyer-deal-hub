// Public (verify_jwt = false): look up an invite by token to render the
// accept-invite page. Returns just enough info to display, never the token
// itself in the response body.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    let token = url.searchParams.get("token") ?? "";
    if (!token && req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      token = String(body.token ?? "");
    }
    if (!token) return json({ error: "missing_token" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: invite } = await admin
      .from("pending_invites")
      .select("id, location_id, email, invited_by_user_id, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();

    if (!invite) return json({ error: "not_found" }, 404);

    // Resolve inviter email + location name (best-effort).
    let invited_by_email: string | null = null;
    if (invite.invited_by_user_id) {
      const { data: p } = await admin
        .from("profiles")
        .select("email, name")
        .eq("user_id", invite.invited_by_user_id)
        .maybeSingle();
      invited_by_email = (p as any)?.email ?? null;
    }
    const { data: loc } = await admin
      .from("ghl_location_tokens")
      .select("location_name")
      .eq("ghl_location_id", invite.location_id)
      .maybeSingle();

    return json({
      location_id: invite.location_id,
      location_name: (loc as any)?.location_name ?? null,
      email: invite.email,
      invited_by_email,
      expired: new Date(invite.expires_at).getTime() < Date.now(),
      accepted: !!invite.accepted_at,
    });
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
