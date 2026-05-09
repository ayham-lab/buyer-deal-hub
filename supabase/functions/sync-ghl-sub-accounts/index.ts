// Manually sync GHL agency sub-accounts: enumerate installed locations and
// mint per-location tokens. Uses an existing token in ghl_location_tokens to
// authenticate against GHL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const logInstall = async (entry: {
    company_id?: string | null;
    location_id?: string | null;
    payload?: unknown;
    error?: string | null;
  }) => {
    try {
      await admin.from("oauth_install_log").insert({
        source: "sync-ghl-sub-accounts",
        company_id: entry.company_id ?? null,
        location_id: entry.location_id ?? null,
        payload: entry.payload ?? null,
        error: entry.error ?? null,
      });
    } catch (e) {
      console.error("oauth_install_log insert failed", e);
    }
  };

  try {
    const app_id = Deno.env.get("GHL_MARKETPLACE_APP_ID") ?? "";
    if (!app_id) return json({ error: "missing_app_id_secret" }, 500);

    let body: { companyId?: string } = {};
    try { body = await req.json(); } catch {}
    let companyId = body.companyId ?? null;

    // Find any existing token to authenticate against GHL.
    let tokenQuery = admin
      .from("ghl_location_tokens")
      .select("ghl_location_id, ghl_company_id, access_token")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (companyId) tokenQuery = tokenQuery.eq("ghl_company_id", companyId);

    const { data: tokenRows, error: tokErr } = await tokenQuery;
    if (tokErr || !tokenRows?.length) {
      const msg = tokErr?.message ?? "no_existing_token";
      await logInstall({ company_id: companyId, error: msg });
      return json({ error: msg, hint: "Install the app at the agency level first." }, 400);
    }
    const seed = tokenRows[0];
    if (!companyId) companyId = seed.ghl_company_id;
    if (!companyId) {
      await logInstall({ error: "no_company_id_on_seed_token", payload: seed });
      return json({ error: "seed_token_has_no_company_id", hint: "Re-install at the agency level so we get a Company-scoped token." }, 400);
    }

    // 1. Enumerate installed locations.
    const listUrl = `${GHL_BASE}/oauth/installedLocations?companyId=${encodeURIComponent(companyId)}&appId=${encodeURIComponent(app_id)}&limit=500`;
    const listResp = await fetch(listUrl, {
      headers: {
        Authorization: `Bearer ${seed.access_token}`,
        Accept: "application/json",
        Version: GHL_API_VERSION,
      },
    });
    const listText = await listResp.text();
    if (!listResp.ok) {
      await logInstall({ company_id: companyId, error: `installedLocations ${listResp.status}: ${listText.slice(0, 500)}` });
      return json({ error: "installedLocations_failed", status: listResp.status, body: listText.slice(0, 500) }, 502);
    }
    let listJson: any;
    try { listJson = JSON.parse(listText); } catch {
      await logInstall({ company_id: companyId, error: "installedLocations_bad_json", payload: listText.slice(0, 500) });
      return json({ error: "installedLocations_bad_json" }, 502);
    }
    await logInstall({ company_id: companyId, payload: listJson });

    const locations: any[] = listJson.locations ?? listJson.data ?? [];
    const minted: { locationId: string; name?: string }[] = [];
    const errors: { locationId: string; error: string }[] = [];

    // 2. For each location, mint a per-location token and upsert.
    for (const loc of locations) {
      const locId: string = loc._id ?? loc.id ?? loc.locationId;
      if (!locId) continue;
      try {
        const mintForm = new URLSearchParams({ companyId, locationId: locId });
        const mintResp = await fetch(`${GHL_BASE}/oauth/locationToken`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${seed.access_token}`,
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
            Version: GHL_API_VERSION,
          },
          body: mintForm.toString(),
        });
        const mintText = await mintResp.text();
        if (!mintResp.ok) {
          await logInstall({ company_id: companyId, location_id: locId, error: `locationToken ${mintResp.status}: ${mintText.slice(0, 300)}` });
          errors.push({ locationId: locId, error: `${mintResp.status}: ${mintText.slice(0, 200)}` });
          continue;
        }
        const mintJson = JSON.parse(mintText);
        const expiresAt = new Date(Date.now() + (Number(mintJson.expires_in) || 0) * 1000).toISOString();
        const { error: upErr } = await admin.from("ghl_location_tokens").upsert(
          {
            ghl_location_id: locId,
            ghl_company_id: companyId,
            access_token: mintJson.access_token,
            refresh_token: mintJson.refresh_token ?? mintJson.access_token,
            expires_at: expiresAt,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "ghl_location_id" },
        );
        if (upErr) {
          await logInstall({ company_id: companyId, location_id: locId, error: `upsert: ${upErr.message}`, payload: mintJson });
          errors.push({ locationId: locId, error: upErr.message });
        } else {
          await logInstall({ company_id: companyId, location_id: locId, payload: { name: loc.name, minted: true } });
          minted.push({ locationId: locId, name: loc.name });
        }
      } catch (e: any) {
        await logInstall({ company_id: companyId, location_id: locId, error: `loop: ${e?.message ?? "err"}` });
        errors.push({ locationId: locId, error: e?.message ?? "err" });
      }
    }

    return json({
      companyId,
      total: locations.length,
      minted_count: minted.length,
      minted,
      errors,
    });
  } catch (err: any) {
    console.error("sync-ghl-sub-accounts unhandled", err);
    return json({ error: err?.message ?? "unexpected_error" }, 500);
  }
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
