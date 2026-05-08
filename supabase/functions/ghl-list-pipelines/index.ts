// Lists pipelines (with stages) for a GHL location using the stored access token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return j({ error: "method_not_allowed" }, 405);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return j({ error: "unauthorized" }, 401);
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims?.sub) return j({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const locationId = body.ghl_location_id;
    if (!locationId) return j({ error: "missing_location" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenRow } = await admin
      .from("ghl_location_tokens")
      .select("access_token")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    if (!tokenRow?.access_token) return j({ error: "no_token_for_location" }, 404);

    const res = await fetch(
      `https://services.leadconnectorhq.com/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      {
        headers: {
          Authorization: `Bearer ${tokenRow.access_token}`,
          Version: "2021-07-28",
          Accept: "application/json",
        },
      },
    );
    const text = await res.text();
    if (!res.ok) {
      console.error("ghl pipelines fetch failed", res.status, text);
      return j({ error: "ghl_fetch_failed", status: res.status }, 502);
    }
    const json = JSON.parse(text);
    const pipelines = (json.pipelines ?? []).map((p: any) => ({
      id: p.id,
      name: p.name,
      stages: (p.stages ?? []).map((s: any) => ({
        id: s.id,
        name: s.name,
        position: s.position,
      })),
    }));
    return j({ pipelines }, 200);
  } catch (err: any) {
    console.error("ghl-list-pipelines error", err);
    return j({ error: err?.message ?? "unexpected_error" }, 500);
  }
});

function j(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
