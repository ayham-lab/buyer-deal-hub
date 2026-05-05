// GHL OAuth: Token endpoint. Exchanges authorization code (or refresh token)
// for an access token + refresh token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function rand(bytes = 32) {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const ct = req.headers.get("content-type") ?? "";
  let body: Record<string, string> = {};
  if (ct.includes("application/x-www-form-urlencoded")) {
    const form = await req.formData();
    form.forEach((v, k) => (body[k] = String(v)));
  } else if (ct.includes("application/json")) {
    body = await req.json();
  } else {
    const txt = await req.text();
    new URLSearchParams(txt).forEach((v, k) => (body[k] = v));
  }

  const url = new URL(req.url);
  url.searchParams.forEach((v, k) => {
    if (!body[k]) body[k] = v;
  });

  // Basic auth fallback
  const auth = req.headers.get("authorization") ?? "";
  if (!body.client_id && auth.startsWith("Basic ")) {
    try {
      const [cid, csec] = atob(auth.slice(6)).split(":");
      body.client_id = cid;
      body.client_secret = csec;
    } catch (_e) { /* ignore */ }
  }

  const grant_type = (body.grant_type ?? body.grantType ?? "").trim();
  const client_id = (body.client_id ?? body.clientId ?? body.client_key ?? body.clientKey ?? "").trim();
  const client_secret = (body.client_secret ?? body.clientSecret ?? "").trim();
  if (!client_id || !client_secret) {
    console.warn("oauth-token invalid_client", {
      reason: "missing_credentials",
      grant_type,
      has_client_id: Boolean(client_id),
      has_client_secret: Boolean(client_secret),
    });
    return json({ error: "invalid_client" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: client } = await supabase
    .from("oauth_clients")
    .select("client_id, client_secret_hash")
    .eq("client_id", client_id)
    .maybeSingle();
  if (!client) {
    console.warn("oauth-token invalid_client", {
      reason: "unknown_client_id",
      grant_type,
      client_id_length: client_id.length,
      client_id_prefix: client_id.slice(0, 8),
    });
    return json({ error: "invalid_client" }, 401);
  }

  const hash = await sha256Hex(client_secret);
  if (hash !== client.client_secret_hash) {
    console.warn("oauth-token invalid_client", {
      reason: "secret_mismatch",
      grant_type,
      client_id_length: client_id.length,
      client_id_prefix: client_id.slice(0, 8),
      secret_length: client_secret.length,
      secret_hash_prefix: hash.slice(0, 8),
    });
    return json({ error: "invalid_client" }, 401);
  }

  if (grant_type === "authorization_code") {
    const { code, redirect_uri } = body;
    if (!code) return json({ error: "invalid_request" }, 400);
    const { data: row } = await supabase
      .from("oauth_authorization_codes")
      .select("*")
      .eq("code", code)
      .maybeSingle();
    if (!row || row.used || new Date(row.expires_at) < new Date() || row.client_id !== client_id || row.redirect_uri !== redirect_uri) {
      return json({ error: "invalid_grant" }, 400);
    }
    await supabase.from("oauth_authorization_codes").update({ used: true }).eq("code", code);
    return await issueTokens(supabase, client_id, row.user_id, row.scope, row.ghl_location_id);
  }

  if (grant_type === "refresh_token") {
    const { refresh_token } = body;
    if (!refresh_token) return json({ error: "invalid_request" }, 400);
    const { data: row } = await supabase
      .from("oauth_access_tokens")
      .select("*")
      .eq("refresh_token", refresh_token)
      .maybeSingle();
    if (!row || row.client_id !== client_id) return json({ error: "invalid_grant" }, 400);
    await supabase.from("oauth_access_tokens").delete().eq("access_token", row.access_token);
    return await issueTokens(supabase, client_id, row.user_id, row.scope, row.ghl_location_id);
  }

  return json({ error: "unsupported_grant_type" }, 400);
});

async function issueTokens(supabase: any, client_id: string, user_id: string, scope: string, ghl_location_id: string | null) {
  const access_token = rand(32);
  const refresh_token = rand(32);
  const expiresInSec = 86399;
  const expires_at = new Date(Date.now() + expiresInSec * 1000).toISOString();
  await supabase.from("oauth_access_tokens").insert({
    access_token, refresh_token, client_id, user_id, scope, ghl_location_id, expires_at,
  });
  return json({
    access_token,
    token_type: "Bearer",
    expires_in: expiresInSec,
    refresh_token,
    scope,
    userType: ghl_location_id ? "Location" : "Company",
    locationId: ghl_location_id,
    companyId: null,
  });
}

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
