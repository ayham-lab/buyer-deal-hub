// READ-ONLY audit. For every location under company l5O3WVAjAPg6osSnZ16i,
// compare our location_memberships.is_owner record against GHL's primary
// admin (from /locations/{id}/users). Returns a JSON diff. NO WRITES.
//
// Tiebreak rule (per spec):
//   1. Filter GHL users where roles.type === 'account' AND roles.role === 'admin'.
//   2. If none -> verdict 'no_ghl_admin'.
//   3. If one -> that's the picked admin.
//   4. If multiple -> pick oldest by dateAdded/createdAt.
//      If timestamps missing/equal -> prefer admin whose roles.locationIds == [this location].
//      Else -> verdict 'multiple_unresolved'.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getGhlPit } from "../_shared/ghlPit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GHL_BASE = "https://services.leadconnectorhq.com";
const GHL_VERSION = "2021-07-28";
// Legacy default. Callers may pass { companyId } to target a different agency.
// Kept for one release so scheduled/manual invocations without a body still work.
const DEFAULT_COMPANY = "l5O3WVAjAPg6osSnZ16i";
const CONCURRENCY = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  let body: { companyId?: string } = {};
  try { body = await req.json(); } catch {}
  const TARGET_COMPANY = (body.companyId ?? DEFAULT_COMPANY).trim();

  const pitLookup = getGhlPit(TARGET_COMPANY);
  const pit_token = pitLookup.token ?? "";
  if (!pit_token) return json({ error: "missing_pit_token", expected: pitLookup.secretName }, 500);
  const source_used = pitLookup.secretName;
  const agency_expires_at: string | null = null;

  // All locations under target company.
  const { data: locs, error: locErr } = await admin
    .from("ghl_location_tokens")
    .select("ghl_location_id, location_name")
    .eq("ghl_company_id", TARGET_COMPANY)
    .not("ghl_location_id", "is", null);
  if (locErr) return json({ error: `loc_query: ${locErr.message}` }, 500);
  const locations = (locs ?? []) as Array<{ ghl_location_id: string; location_name: string | null }>;



  // 4. Current owners map.
  const ids = locations.map((l) => l.ghl_location_id);
  const { data: memberships } = await admin
    .from("location_memberships")
    .select("location_id, user_id")
    .eq("is_owner", true)
    .in("location_id", ids);
  const ownerByLoc = new Map<string, string>();
  for (const m of memberships ?? []) ownerByLoc.set((m as any).location_id, (m as any).user_id);

  const ownerUserIds = Array.from(new Set([...ownerByLoc.values()]));
  const emailByUser = new Map<string, string | null>();
  if (ownerUserIds.length > 0) {
    const { data: profs } = await admin
      .from("profiles")
      .select("user_id, email")
      .in("user_id", ownerUserIds);
    for (const p of profs ?? []) emailByUser.set((p as any).user_id, (p as any).email ?? null);
  }

  // 5. For each location: GET /locations/{id}/users with agency token.
  type Diff = {
    location_id: string;
    location_name: string | null;
    current_owner_user_id: string | null;
    current_owner_email: string | null;
    ghl_admin_user_id: string | null;
    ghl_admin_email: string | null;
    ghl_admin_name: string | null;
    verdict: "correct" | "wrong" | "missing" | "no_ghl_admin" | "multiple_unresolved" | "fetch_failed";
    action_proposed: "keep" | "reassign_to_ghl_admin" | "insert_ghl_admin_as_owner" | "manual_review";
    detail?: string;
  };

  const diffs: Diff[] = [];
  let cursor = 0;
  async function worker() {
    while (cursor < locations.length) {
      const i = cursor++;
      const loc = locations[i];
      const lid = loc.ghl_location_id;
      const cur_user = ownerByLoc.get(lid) ?? null;
      const cur_email = cur_user ? (emailByUser.get(cur_user) ?? null) : null;
      try {
        let r: Response | null = null;
        let txt = "";
        for (let attempt = 0; attempt < 5; attempt++) {
          r = await fetch(`${GHL_BASE}/users/search?companyId=${encodeURIComponent(TARGET_COMPANY)}&locationId=${encodeURIComponent(lid)}`, {
            headers: {
              Authorization: `Bearer ${pit_token}`,
              Version: GHL_VERSION,
              Accept: "application/json",
            },
          });
          txt = await r.text();
          if (r.status !== 429) break;
          await new Promise((res) => setTimeout(res, 1500 * (attempt + 1)));
        }
        if (!r) throw new Error("no_response");

        if (!r.ok) {
          diffs.push({
            location_id: lid, location_name: loc.location_name,
            current_owner_user_id: cur_user, current_owner_email: cur_email,
            ghl_admin_user_id: null, ghl_admin_email: null, ghl_admin_name: null,
            verdict: "fetch_failed", action_proposed: "manual_review",
            detail: `${r.status}: ${txt.slice(0, 160)}`,
          });
          continue;
        }
        const j = JSON.parse(txt);
        const users: any[] = j?.users ?? j?.data ?? [];
        // Admin filter: roles.type === 'account' && roles.role === 'admin'.
        const admins = users.filter((u) => {
          const t = u?.roles?.type ?? u?.type;
          const role = u?.roles?.role ?? u?.role;
          return t === "account" && role === "admin";
        });
        let picked: any = null;
        let verdict_extra: "no_ghl_admin" | "multiple_unresolved" | null = null;
        if (admins.length === 0) {
          verdict_extra = "no_ghl_admin";
        } else if (admins.length === 1) {
          picked = admins[0];
        } else {
          // Sort by dateAdded/createdAt ascending.
          const ts = (u: any) => {
            const v = u?.dateAdded ?? u?.createdAt ?? u?.created_at ?? null;
            return v ? new Date(v).getTime() : Number.MAX_SAFE_INTEGER;
          };
          const sorted = [...admins].sort((a, b) => ts(a) - ts(b));
          if (ts(sorted[0]) < ts(sorted[1])) {
            picked = sorted[0];
          } else {
            // Tiebreak: admin dedicated to this location only.
            const dedicated = admins.filter((u) => {
              const list: string[] = u?.roles?.locationIds ?? u?.locationIds ?? [];
              return Array.isArray(list) && list.length === 1 && list[0] === lid;
            });
            if (dedicated.length === 1) picked = dedicated[0];
            else verdict_extra = "multiple_unresolved";
          }
        }

        const ghl_admin_id = picked?.id ?? picked?.userId ?? null;
        const ghl_admin_email = picked?.email ?? null;
        const ghl_admin_name = picked
          ? [picked.firstName, picked.lastName].filter(Boolean).join(" ") || picked.name || null
          : null;

        let verdict: Diff["verdict"];
        let action: Diff["action_proposed"];
        if (verdict_extra === "no_ghl_admin") {
          verdict = "no_ghl_admin"; action = "manual_review";
        } else if (verdict_extra === "multiple_unresolved") {
          verdict = "multiple_unresolved"; action = "manual_review";
        } else {
          // Match GHL admin email to a profile in our DB.
          let matched_user: string | null = null;
          if (ghl_admin_email) {
            const { data: matchProf } = await admin
              .from("profiles")
              .select("user_id")
              .ilike("email", ghl_admin_email)
              .maybeSingle();
            matched_user = (matchProf as any)?.user_id ?? null;
          }
          if (!cur_user) {
            verdict = "missing"; action = "insert_ghl_admin_as_owner";
          } else if (matched_user && matched_user === cur_user) {
            verdict = "correct"; action = "keep";
          } else if (cur_email && ghl_admin_email && cur_email.toLowerCase() === ghl_admin_email.toLowerCase()) {
            verdict = "correct"; action = "keep";
          } else {
            verdict = "wrong"; action = "reassign_to_ghl_admin";
          }
          diffs.push({
            location_id: lid, location_name: loc.location_name,
            current_owner_user_id: cur_user, current_owner_email: cur_email,
            ghl_admin_user_id: ghl_admin_id, ghl_admin_email, ghl_admin_name,
            verdict, action_proposed: action,
            detail: matched_user ? `matched_local_user=${matched_user}` : "no_local_profile_match",
          });
          continue;
        }
        diffs.push({
          location_id: lid, location_name: loc.location_name,
          current_owner_user_id: cur_user, current_owner_email: cur_email,
          ghl_admin_user_id: ghl_admin_id, ghl_admin_email, ghl_admin_name,
          verdict, action_proposed: action,
          detail: `admins_returned=${admins.length}`,
        });
      } catch (e: any) {
        diffs.push({
          location_id: lid, location_name: loc.location_name,
          current_owner_user_id: cur_user, current_owner_email: cur_email,
          ghl_admin_user_id: null, ghl_admin_email: null, ghl_admin_name: null,
          verdict: "fetch_failed", action_proposed: "manual_review",
          detail: `threw: ${e?.message ?? "err"}`,
        });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const summary = {
    company: TARGET_COMPANY,
    total: diffs.length,
    correct: diffs.filter((d) => d.verdict === "correct").length,
    wrong: diffs.filter((d) => d.verdict === "wrong").length,
    missing: diffs.filter((d) => d.verdict === "missing").length,
    no_ghl_admin: diffs.filter((d) => d.verdict === "no_ghl_admin").length,
    multiple_unresolved: diffs.filter((d) => d.verdict === "multiple_unresolved").length,
    fetch_failed: diffs.filter((d) => d.verdict === "fetch_failed").length,
    agency_token_source: source_used,
    agency_token_expires_at: agency_expires_at,
  };
  return json({ summary, diffs });
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
