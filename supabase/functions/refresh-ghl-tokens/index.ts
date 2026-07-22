// Refreshes any GHL OAuth tokens (Company or Location) whose `expires_at` is
// within the next 2 hours. Designed to be invoked by pg_cron hourly so the
// agency-level Company token never lapses — that token is what we use to
// re-mint per-location tokens and enumerate newly-installed sub-accounts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { fetchAndResolveLocationName } from "../_shared/ghlLocationName.ts";
import { getGhlPit } from "../_shared/ghlPit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const client_id = Deno.env.get("GHL_MARKETPLACE_CLIENT_ID") ?? "";
  const client_secret = Deno.env.get("GHL_MARKETPLACE_CLIENT_SECRET") ?? "";
  if (!client_id || !client_secret) {
    return j({ error: "server_misconfigured" }, 500);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  // Refresh anything expiring in the next 2 hours.
  const cutoff = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();

  const { data: rows, error } = await admin
    .from("ghl_location_tokens")
    .select("id, ghl_location_id, ghl_company_id, refresh_token, expires_at")
    .lte("expires_at", cutoff);

  if (error) return j({ error: error.message }, 500);

  const refreshed: string[] = [];
  const errors: string[] = [];

  for (const row of rows ?? []) {
    const isCompany = row.ghl_location_id === null;
    const label = isCompany ? `company:${row.ghl_company_id}` : `loc:${row.ghl_location_id}`;
    try {
      const form = new URLSearchParams({
        client_id,
        client_secret,
        grant_type: "refresh_token",
        refresh_token: row.refresh_token,
        user_type: isCompany ? "Company" : "Location",
      });
      const resp = await fetch(`${GHL_BASE}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: form.toString(),
      });
      const text = await resp.text();
      if (!resp.ok) {
        console.error(`refresh failed ${label}`, resp.status, text);
        errors.push(`${label} ${resp.status}`);
        continue;
      }
      const parsed = JSON.parse(text);
      const newExpires = new Date(Date.now() + (Number(parsed.expires_in) || 0) * 1000).toISOString();
      const returnedCompanyId: string | null = parsed.companyId ?? parsed.company_id ?? null;
      const update: Record<string, unknown> = {
        access_token: parsed.access_token,
        refresh_token: parsed.refresh_token ?? row.refresh_token,
        expires_at: newExpires,
        updated_at: new Date().toISOString(),
      };
      // Reconciliation: if GHL returns a different companyId, the sub-account
      // has been transferred between agencies. Update the row and log both to
      // function logs and ownership_audit_log.
      if (
        returnedCompanyId &&
        row.ghl_company_id &&
        returnedCompanyId !== row.ghl_company_id
      ) {
        console.warn(
          "ghl_company_id reconciled",
          JSON.stringify({
            locationId: row.ghl_location_id,
            from: row.ghl_company_id,
            to: returnedCompanyId,
            source: "refresh-ghl-tokens",
          }),
        );
        update.ghl_company_id = returnedCompanyId;
        try {
          await admin.from("ownership_audit_log").insert({
            location_id: row.ghl_location_id,
            action: "company_id_reconciled",
            executed_by: "refresh-ghl-tokens",
            detail: { from: row.ghl_company_id, to: returnedCompanyId, source: "refresh" },
          });
        } catch (e) {
          console.error("ownership_audit_log insert failed (reconcile)", e);
        }
      } else if (returnedCompanyId && !row.ghl_company_id) {
        update.ghl_company_id = returnedCompanyId;
      }
      // Refresh the display name on each pass. Use the correct per-agency PIT —
      // if reconciled above, the NEW companyId's PIT so name resolution works
      // for the new tenant.
      const effectiveCompanyId = returnedCompanyId ?? row.ghl_company_id;
      const { token: pit } = getGhlPit(effectiveCompanyId);
      if (!isCompany && pit && row.ghl_location_id) {
        const nameRes = await fetchAndResolveLocationName(row.ghl_location_id, pit);
        if (nameRes.name) update.location_name = nameRes.name;
      }
      const { error: updErr } = await admin
        .from("ghl_location_tokens")
        .update(update)
        .eq("id", row.id);
      if (updErr) {
        errors.push(`${label} update: ${updErr.message}`);
      } else {
        refreshed.push(label);
      }
    } catch (e: any) {
      console.error(`refresh threw ${label}`, e);
      errors.push(`${label}: ${e?.message ?? "err"}`);
    }
  }

  return j({ checked: rows?.length ?? 0, refreshed: refreshed.length, errors });
});

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
