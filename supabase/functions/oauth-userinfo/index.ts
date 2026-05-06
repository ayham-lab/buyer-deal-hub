// GHL OAuth: Userinfo endpoint. Validates Bearer token, returns user identity
// + linked GHL locations.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = req.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
  const token = auth.slice(7);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: t } = await supabase
    .from("oauth_access_tokens")
    .select("*")
    .eq("access_token", token)
    .maybeSingle();
  if (!t || new Date(t.expires_at) < new Date()) return j({ error: "invalid_token" }, 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, name")
    .eq("user_id", t.user_id)
    .maybeSingle();

  const { data: locations } = await supabase
    .from("ghl_location_links")
    .select("ghl_location_id, ghl_location_name")
    .eq("user_id", t.user_id);

  return j({
    sub: t.user_id,
    email: profile?.email ?? null,
    name: profile?.name ?? null,
    ghl_locations: locations ?? [],
    ghl_location_id: t.ghl_location_id,
    scope: t.scope,
  });
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
