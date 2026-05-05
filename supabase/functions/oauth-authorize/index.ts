// GHL OAuth: Authorization endpoint. Validates client + redirect_uri, then
// redirects the browser to the in-app consent screen.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const APP_ORIGIN = Deno.env.get("APP_ORIGIN") ?? "https://id-preview--279be52c-88b9-4094-8e2d-86818e08449e.lovable.app";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const client_id = url.searchParams.get("client_id") ?? "";
  const redirect_uri = url.searchParams.get("redirect_uri") ?? "";
  const response_type = url.searchParams.get("response_type") ?? "code";
  const scope = url.searchParams.get("scope") ?? "read write";
  const state = url.searchParams.get("state") ?? "";

  if (response_type !== "code") {
    return new Response("unsupported_response_type", { status: 400, headers: corsHeaders });
  }
  if (!client_id || !redirect_uri) {
    return new Response("missing client_id or redirect_uri", { status: 400, headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: client, error } = await supabase
    .from("oauth_clients")
    .select("client_id, redirect_uris, scopes")
    .eq("client_id", client_id)
    .maybeSingle();

  if (error || !client) {
    return new Response("invalid_client", { status: 400, headers: corsHeaders });
  }
  if (!client.redirect_uris.includes(redirect_uri)) {
    return new Response("invalid redirect_uri", { status: 400, headers: corsHeaders });
  }

  const consent = new URL("/oauth/consent", APP_ORIGIN);
  consent.searchParams.set("client_id", client_id);
  consent.searchParams.set("redirect_uri", redirect_uri);
  consent.searchParams.set("scope", scope);
  consent.searchParams.set("state", state);

  return Response.redirect(consent.toString(), 302);
});
