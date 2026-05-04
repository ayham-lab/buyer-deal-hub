// Called from the in-app consent page after the user approves. Validates the
// user's JWT, mints an authorization code, and returns the GHL redirect URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function rand(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
  const userJwt = auth.slice(7);

  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${userJwt}` } } },
  );
  const { data: claims, error: claimsErr } = await userClient.auth.getClaims(userJwt);
  if (claimsErr || !claims?.claims) return j({ error: "unauthorized" }, 401);
  const user_id = claims.claims.sub as string;

  const body = await req.json().catch(() => ({}));
  const { client_id, redirect_uri, scope = "read write", state = "", ghl_location_id = null } = body ?? {};
  if (!client_id || !redirect_uri) return j({ error: "invalid_request" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: client } = await admin
    .from("oauth_clients").select("client_id, redirect_uris")
    .eq("client_id", client_id).maybeSingle();
  if (!client || !client.redirect_uris.includes(redirect_uri)) return j({ error: "invalid_client" }, 400);

  const code = rand(24);
  const expires_at = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await admin.from("oauth_authorization_codes").insert({
    code, client_id, user_id, redirect_uri, scope, ghl_location_id, expires_at,
  });

  const url = new URL(redirect_uri);
  url.searchParams.set("code", code);
  if (state) url.searchParams.set("state", state);

  return j({ redirect_to: url.toString() });
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
