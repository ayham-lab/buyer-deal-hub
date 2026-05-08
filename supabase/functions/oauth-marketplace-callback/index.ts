// Exchanges a GHL Marketplace authorization code for access/refresh tokens.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
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
    if (!code || !redirect_uri) {
      return json({ error: "missing_code_or_redirect_uri" }, 400);
    }

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

    // Persist tokens for this location (service role bypasses RLS)
    try {
      const tok = parsed as any;
      const locationId = tok.locationId ?? tok.location_id;
      const companyId = tok.companyId ?? tok.company_id ?? null;
      if (!locationId) {
        console.log("oauth-marketplace-callback: skipping token upsert (no locationId)");
      } else {
        const admin = createClient(
          Deno.env.get("SUPABASE_URL")!,
          Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
        );
        const expiresAt = new Date(Date.now() + (Number(tok.expires_in) || 0) * 1000).toISOString();
        const { error: upErr } = await admin
          .from("ghl_location_tokens")
          .upsert(
            {
              ghl_location_id: locationId,
              ghl_company_id: companyId,
              access_token: tok.access_token,
              refresh_token: tok.refresh_token,
              expires_at: expiresAt,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "ghl_location_id" },
          );
        if (upErr) {
          console.error("ghl_location_tokens upsert failed", upErr);
        } else {
          console.log("ghl_location_tokens upsert ok for", locationId);
        }
      }
    } catch (persistErr) {
      console.error("ghl_location_tokens persist threw", persistErr);
    }

    return json(parsed, 200);
  } catch (err: any) {
    console.error("oauth-marketplace-callback unhandled error", err);
    return json({ error: err?.message ?? "unexpected_error" }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
