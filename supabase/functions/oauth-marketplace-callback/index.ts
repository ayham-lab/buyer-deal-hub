// Exchanges a GHL Marketplace authorization code for access/refresh tokens.
// Supports both sub-account (Location) and agency (Company) installs. For
// agency installs, enumerates installed sub-accounts and mints per-location
// tokens so Dispo Pro can act on each sub-account independently.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Max-Age": "86400",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_API_VERSION = "2021-07-28";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

    let body: { code?: string; redirect_uri?: string } = {};
    try {
      body = await req.json();
    } catch {
      return json({ error: "invalid_json" }, 400);
    }
    const { code, redirect_uri } = body;
    if (!code || !redirect_uri) return json({ error: "missing_code_or_redirect_uri" }, 400);

    const client_id = Deno.env.get("GHL_MARKETPLACE_CLIENT_ID") ?? "";
    const client_secret = Deno.env.get("GHL_MARKETPLACE_CLIENT_SECRET") ?? "";
    const app_id = Deno.env.get("GHL_MARKETPLACE_APP_ID") ?? "";
    if (!client_id || !client_secret) {
      console.error("oauth-marketplace-callback missing client credentials");
      return json({ error: "server_misconfigured" }, 500);
    }

    // First exchange: try as-is. GHL returns userType=Company OR Location based
    // on how the app was installed; we don't need to force user_type here.
    const form = new URLSearchParams({
      client_id,
      client_secret,
      grant_type: "authorization_code",
      code,
      redirect_uri,
    });

    const upstream = await fetch(`${GHL_BASE}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: form.toString(),
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      console.error("ghl token exchange failed", upstream.status, text);
      return json({ error: text }, upstream.status);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("ghl token exchange non-json response", text);
      return json({ error: "invalid_upstream_response" }, 502);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Best-effort: log every token-exchange payload we get from GHL so we can
    // diagnose installs that don't end up writing rows.
    try {
      await admin.from("oauth_install_log").insert({
        source: "oauth-marketplace-callback",
        company_id: parsed.companyId ?? parsed.company_id ?? null,
        location_id: parsed.locationId ?? parsed.location_id ?? null,
        payload: parsed,
      });
    } catch (e) {
      console.error("oauth_install_log insert failed", e);
    }

    const companyId: string | null = parsed.companyId ?? parsed.company_id ?? null;
    const locationId: string | null = parsed.locationId ?? parsed.location_id ?? null;
    const userType: string = parsed.userType ?? parsed.user_type ?? (locationId ? "Location" : "Company");
    const expiresAt = (secs: number) =>
      new Date(Date.now() + (Number(secs) || 0) * 1000).toISOString();

    const upsertedLocations: string[] = [];
    const errors: string[] = [];

    // Sub-account install: single upsert.
    if (locationId) {
      const { error: upErr } = await persistLocationToken(admin, {
        ghl_location_id: locationId,
        ghl_company_id: companyId,
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token,
        expires_at: expiresAt(parsed.expires_in),
        updated_at: new Date().toISOString(),
      });
      if (upErr) {
        console.error("ghl_location_tokens upsert failed (location)", upErr);
        errors.push(`location upsert: ${upErr.message}`);
      } else {
        upsertedLocations.push(locationId);
      }
    }

    // Agency install: enumerate installed sub-accounts and mint per-location tokens.
    if (userType === "Company" && companyId) {
      // Persist the Company-scoped token (ghl_location_id IS NULL) so we can
      // later refresh it from cron and re-enumerate sub-accounts without
      // forcing the user through a full agency reinstall.
      try {
        const { data: existing, error: selErr } = await admin
          .from("ghl_location_tokens")
          .select("id")
          .is("ghl_location_id", null)
          .eq("ghl_company_id", companyId)
          .maybeSingle();
        if (selErr) throw selErr;

        const companyRow = {
          ghl_company_id: companyId,
          ghl_location_id: null as string | null,
          access_token: parsed.access_token,
          refresh_token: parsed.refresh_token,
          expires_at: expiresAt(parsed.expires_in),
          updated_at: new Date().toISOString(),
        };

        if (existing?.id) {
          const { error: updErr } = await admin
            .from("ghl_location_tokens")
            .update(companyRow)
            .eq("id", existing.id);
          if (updErr) throw updErr;
        } else {
          const { error: insErr } = await admin
            .from("ghl_location_tokens")
            .insert(companyRow);
          if (insErr) throw insErr;
        }
        console.log("persisted company token row for", companyId);
      } catch (e: any) {
        console.error("company token persist failed", e);
        errors.push(`company persist: ${e?.message ?? "err"}`);
      }

      if (!app_id) {
        console.error("GHL_MARKETPLACE_APP_ID missing — cannot enumerate installed locations");
        errors.push("missing_app_id");
      } else {
        try {
          const listUrl = `${GHL_BASE}/oauth/installedLocations?companyId=${encodeURIComponent(
            companyId,
          )}&appId=${encodeURIComponent(app_id)}&limit=500`;
          const listResp = await fetch(listUrl, {
            headers: {
              Authorization: `Bearer ${parsed.access_token}`,
              Accept: "application/json",
              Version: GHL_API_VERSION,
            },
          });
          const listText = await listResp.text();
          if (!listResp.ok) {
            console.error("installedLocations failed", listResp.status, listText);
            errors.push(`installedLocations ${listResp.status}: ${listText.slice(0, 200)}`);
          } else {
            const listJson = JSON.parse(listText);
            const locations: any[] = listJson.locations ?? listJson.data ?? [];
            console.log(`installedLocations returned ${locations.length} location(s) for company ${companyId}`);

            for (const loc of locations) {
              const locId: string = loc._id ?? loc.id ?? loc.locationId;
              if (!locId) continue;
              try {
                const mintForm = new URLSearchParams({
                  companyId,
                  locationId: locId,
                });
                const mintResp = await fetch(`${GHL_BASE}/oauth/locationToken`, {
                  method: "POST",
                  headers: {
                    Authorization: `Bearer ${parsed.access_token}`,
                    "Content-Type": "application/x-www-form-urlencoded",
                    Accept: "application/json",
                    Version: GHL_API_VERSION,
                  },
                  body: mintForm.toString(),
                });
                const mintText = await mintResp.text();
                if (!mintResp.ok) {
                  console.error(`locationToken mint failed for ${locId}`, mintResp.status, mintText);
                  errors.push(`mint ${locId} ${mintResp.status}`);
                  continue;
                }
                const mintJson = JSON.parse(mintText);
                const { error: upErr } = await persistLocationToken(admin, {
                  ghl_location_id: locId,
                  ghl_company_id: companyId,
                  access_token: mintJson.access_token,
                  refresh_token: mintJson.refresh_token ?? mintJson.access_token,
                  expires_at: expiresAt(mintJson.expires_in),
                  updated_at: new Date().toISOString(),
                });
                if (upErr) {
                  console.error(`upsert failed for ${locId}`, upErr);
                  errors.push(`upsert ${locId}: ${upErr.message}`);
                } else {
                  upsertedLocations.push(locId);
                }
              } catch (e: any) {
                console.error(`mint loop error for ${locId}`, e);
                errors.push(`mint ${locId}: ${e?.message ?? "err"}`);
              }
            }
          }
        } catch (e: any) {
          console.error("agency enumeration threw", e);
          errors.push(`enum: ${e?.message ?? "err"}`);
        }
      }
    }

    console.log("oauth-marketplace-callback done", {
      userType,
      companyId,
      locationId,
      upserted: upsertedLocations.length,
      errors: errors.length,
    });

    const firstPersistError = errors[0] ?? null;
    return json(
      {
        ...parsed,
        _persisted_locations: upsertedLocations,
        _persist_errors: errors.length ? errors : undefined,
        _first_persist_error: firstPersistError,
      },
      200,
    );
  } catch (err: any) {
    console.error("oauth-marketplace-callback unhandled error", err);
    return json({ error: err?.message ?? "unexpected_error" }, 500);
  }
});

async function persistLocationToken(admin: any, row: {
  ghl_location_id: string;
  ghl_company_id: string | null;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  updated_at: string;
}) {
  const { data: existing, error: selErr } = await admin
    .from("ghl_location_tokens")
    .select("id")
    .eq("ghl_location_id", row.ghl_location_id)
    .maybeSingle();
  if (selErr) return { error: selErr };

  // After token persist, ensure a workspace owner exists in
  // location_memberships so the new install has a clear owner who can invite
  // the rest of the team. We map ownership to ghl_location_links.workspace_owner_user_id
  // (set during the SSO/install flow) — never to ghl_location_tokens (no user_id).
  await ensureOwnerMembership(admin, row.ghl_location_id);

  if (existing?.id) {
    return await admin.from("ghl_location_tokens").update(row).eq("id", existing.id);
  }
  return await admin.from("ghl_location_tokens").insert(row);
}

async function ensureOwnerMembership(admin: any, locationId: string) {
  try {
    const { data: link } = await admin
      .from("ghl_location_links")
      .select("workspace_owner_user_id")
      .eq("ghl_location_id", locationId)
      .not("workspace_owner_user_id", "is", null)
      .limit(1)
      .maybeSingle();
    const ownerId = link?.workspace_owner_user_id;
    if (!ownerId) return; // no SSO link yet — first user to SSO will become owner via trigger-less flow
    await admin.from("location_memberships").upsert(
      { location_id: locationId, user_id: ownerId, role: "owner", is_owner: true },
      { onConflict: "location_id,user_id" },
    );
  } catch (e) {
    console.error("ensureOwnerMembership failed", e);
  }
}

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
