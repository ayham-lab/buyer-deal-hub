// Owner-only: create a pending invite for a teammate. Returns the magic link
// for the owner to copy/paste — real email delivery is wired separately.
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
    const { data: { user }, error: uErr } = await userClient.auth.getUser();
    if (uErr || !user) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const location_id = String(body.location_id ?? "").trim();
    const role = String(body.role ?? "member").trim() || "member";
    if (!email || !location_id) return json({ error: "missing_email_or_location" }, 400);

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Owner check (server-side, never trust client).
    const { data: ownerRow } = await admin
      .from("location_memberships")
      .select("id")
      .eq("location_id", location_id)
      .eq("user_id", user.id)
      .eq("is_owner", true)
      .maybeSingle();
    if (!ownerRow) return json({ error: "forbidden_not_owner" }, 403);

    // Generate token
    const tokenBytes = new Uint8Array(32);
    crypto.getRandomValues(tokenBytes);
    const token = Array.from(tokenBytes).map((b) => b.toString(16).padStart(2, "0")).join("");

    const { data: invite, error: insErr } = await admin
      .from("pending_invites")
      .insert({
        location_id,
        email,
        invited_by_user_id: user.id,
        token,
      })
      .select("id, token, expires_at")
      .single();
    if (insErr) return json({ error: insErr.message }, 500);

    const origin = req.headers.get("origin") ?? "";
    const invite_url = `${origin}/accept-invite?token=${token}`;

    return json({ ok: true, invite, invite_url });
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
