// Lists pipelines (with stages) for a GHL location using the stored access token.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getValidGhlAccessToken } from "../_shared/ghlToken.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { status: 200, headers: corsHeaders });

  try {
    if (req.method !== "POST") return j({ error: "method_not_allowed" });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return j({ error: "unauthorized" });
    }
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user?.id) {
      console.error("auth failed", userErr?.message);
      return j({ error: "unauthorized" });
    }

    const body = await req.json().catch(() => ({}));
    const locationId = body.ghl_location_id;
    console.log("ghl-list-pipelines locationId:", locationId);
    if (!locationId) return j({ error: "missing_location" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: tokenRow, error: tokErr } = await admin
      .from("ghl_location_tokens")
      .select("access_token")
      .eq("ghl_location_id", locationId)
      .maybeSingle();

    console.log("token present:", !!tokenRow?.access_token, "tokErr:", tokErr?.message);
    if (!tokenRow?.access_token) return j({ error: "no_token_for_location" });

    try {
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
      console.log("GHL pipelines status:", res.status);
      const text = await res.text();
      if (!res.ok) {
        console.error("ghl pipelines fetch failed", res.status, text);
        return j({ error: `GHL API ${res.status}: ${text.slice(0, 300)}` });
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
      return j({ pipelines });
    } catch (fetchErr: any) {
      console.error("GHL fetch threw", fetchErr);
      return j({ error: `Fetch failed: ${fetchErr?.message ?? fetchErr}` });
    }
  } catch (err: any) {
    console.error("ghl-list-pipelines error", err);
    return j({ error: err?.message ?? "unexpected_error" });
  }
});

function j(o: unknown) {
  return new Response(JSON.stringify(o), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
