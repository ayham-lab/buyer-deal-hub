// Links a GHL location to the current user's workspace. Ownership is
// first-established-wins: if the location already belongs to a different
// workspace owner this returns ok:false/location_already_linked instead of
// reassigning it (membership in someone else's workspace is granted via
// iframe SSO or team invites, never here). Enforces a max of 10 linked
// locations per workspace owner.
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

  const { ghl_location_id, ghl_location_name, ghl_company_id } = await req.json().catch(() => ({}));
  if (!ghl_location_id) return j({ error: "missing_location" }, 400);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Established owner = owner on the earliest link row for this location.
  const { data: existing, error: existErr } = await admin
    .from("ghl_location_links")
    .select("workspace_owner_user_id")
    .eq("ghl_location_id", ghl_location_id)
    .order("linked_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (existErr) return j({ error: existErr.message }, 500);

  const establishedOwner = existing?.workspace_owner_user_id ?? null;
  if (establishedOwner && establishedOwner !== user_id) {
    return j({ ok: false, reason: "location_already_linked" });
  }

  if (!establishedOwner) {
    const { data: owned, error: ownedErr } = await admin
      .from("ghl_location_links")
      .select("ghl_location_id")
      .eq("workspace_owner_user_id", user_id);
    if (ownedErr) return j({ error: ownedErr.message }, 500);
    const ownedCount = new Set((owned ?? []).map((r) => r.ghl_location_id)).size;
    if (ownedCount >= MAX_LOCATIONS) return j({ error: "max_locations_reached" }, 400);
  }

  const { error: upErr } = await admin
    .from("ghl_location_links")
    .upsert({
      user_id,
      workspace_owner_user_id: user_id,
      linked_by_user_id: user_id,
      ghl_location_id,
      ghl_location_name: ghl_location_name ?? null,
      ghl_company_id: ghl_company_id ?? null,
    }, { onConflict: "user_id,ghl_location_id" });

  if (upErr) return j({ error: upErr.message }, 400);

  if (!establishedOwner) {
    await admin.from("ownership_audit_log").insert({
      location_id: ghl_location_id,
      action: "insert",
      old_owner_user_id: null,
      new_owner_user_id: user_id,
      executed_by: "link-ghl-location",
      detail: { source: "standalone_link" },
    });
  }

  return j({ ok: true });
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
