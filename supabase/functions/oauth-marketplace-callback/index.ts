// Exchanges a GHL Marketplace authorization code for access/refresh tokens.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let body: { code?: string; redirect_uri?: string } = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const { code, redirect_uri } = body;
  if (!code || !redirect_uri) return json({ error: "missing_code_or_redirect_uri" }, 400);

  const client_id = Deno.env.get("GHL_MARKETPLACE_CLIENT_ID") ?? "";
  const client_secret = Deno.env.get("GHL_MARKETPLACE_CLIENT_SECRET") ?? "";
  if (!client_id || !client_secret) {
    console.error("oauth-marketplace-callback missing client credentials");
    return json({ error: "server_misconfigured" }, 500);
  }

  const form = new URLSearchParams({
    client_id,
    client_secret,
    grant_type: "authorization_code",
    code,
    redirect_uri,
    user_type: "Location",
  });

  const upstream = await fetch("https://services.leadconnectorhq.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: form.toString(),
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    console.error("ghl token exchange failed", upstream.status, text);
    return json({ error: text }, upstream.status);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error("ghl token exchange non-json response", text);
    return json({ error: "invalid_upstream_response" }, 502);
  }
  return json(parsed, 200);
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
