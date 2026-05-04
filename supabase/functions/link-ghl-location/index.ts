// Links a GHL location to the current user's workspace. Enforces a max of 10
// linked locations per workspace owner.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_LOCATIONS = 10;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
  const user_id = claims.claims.sub as string;

  const { ghl_location_id, ghl_location_name } = await req.json().catch(() => ({}));
  if (!ghl_location_id) return j({ error: "missing_location" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { count } = await admin
    .from("ghl_location_links")
    .select("id", { count: "exact", head: true })
    .eq("workspace_owner_user_id", user_id);
  if ((count ?? 0) >= MAX_LOCATIONS) return j({ error: "max_locations_reached" }, 400);

  const { error: upErr } = await admin
    .from("ghl_location_links")
    .upsert({
      workspace_owner_user_id: user_id,
      linked_by_user_id: user_id,
      ghl_location_id,
      ghl_location_name: ghl_location_name ?? null,
    }, { onConflict: "ghl_location_id" });

  if (upErr) return j({ error: upErr.message }, 400);
  return j({ ok: true });
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
