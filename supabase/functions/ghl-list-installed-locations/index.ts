// Returns all installed GHL locations from ghl_location_tokens (service role).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return j({ error: "unauthorized" }, 401);
    const jwt = auth.slice(7);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } } },
    );
    const { data: claims, error } = await userClient.auth.getClaims(jwt);
    if (error || !claims?.claims) return j({ error: "unauthorized" }, 401);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data, error: qErr } = await admin
      .from("ghl_location_tokens")
      .select("ghl_location_id, ghl_company_id, updated_at")
      .order("updated_at", { ascending: false });
    if (qErr) return j({ error: qErr.message }, 500);

    return j({ locations: data ?? [] });
  } catch (e: any) {
    return j({ error: e?.message ?? "unexpected_error" }, 500);
  }
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
