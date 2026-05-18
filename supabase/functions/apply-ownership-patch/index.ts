// Re-runnable data patch: brings location_memberships + ghl_location_links
// in line with GHL truth for company l5O3WVAjAPg6osSnZ16i (and any other
// company specified). For each location:
//   - If GHL admin matches current owner: skip (idempotent).
//   - If current owner is wrong: insert/upgrade GHL admin as owner, demote
//     the old owner to member.
//   - If no current owner: provision the GHL admin and insert link + owner
//     membership.
//   - If no_ghl_admin or multiple_unresolved: queue in manual_review_queue.
// Every change is written to ownership_audit_log.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  resolveGhlAdminForLocation,
  ghlUserDisplayName,
  provisionAuthUserByEmail,
} from "../_shared/ghlOwnership.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DEFAULT_COMPANY = "l5O3WVAjAPg6osSnZ16i";
const CONCURRENCY = 2;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { companyId?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch {}
  const companyId = body.companyId ?? DEFAULT_COMPANY;
  const dryRun = body.dryRun === true;

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: locs, error: locErr } = await admin
    .from("ghl_location_tokens")
    .select("ghl_location_id, location_name")
    .eq("ghl_company_id", companyId)
    .not("ghl_location_id", "is", null);
  if (locErr) return json({ error: `loc_query: ${locErr.message}` }, 500);
  const locations = (locs ?? []) as Array<{ ghl_location_id: string; location_name: string | null }>;

  type Outcome = {
    location_id: string;
    action: "skip_correct" | "insert" | "reassign" | "queue_manual" | "error";
    old_owner_user_id?: string | null;
    new_owner_user_id?: string | null;
    ghl_admin_email?: string | null;
    detail?: string;
  };
  const outcomes: Outcome[] = [];

  let cursor = 0;
  async function worker() {
    while (cursor < locations.length) {
      const i = cursor++;
      const loc = locations[i];
      const lid = loc.ghl_location_id;
      try {
        // Current owner row.
        const { data: curOwner } = await admin
          .from("location_memberships")
          .select("user_id")
          .eq("location_id", lid)
          .eq("is_owner", true)
          .maybeSingle();
        const curOwnerId: string | null = (curOwner as any)?.user_id ?? null;
        const curOwnerEmail: string | null = curOwnerId
          ? ((await admin.from("profiles").select("email").eq("user_id", curOwnerId).maybeSingle()).data as any)?.email ?? null
          : null;

        let verdict = await resolveGhlAdminForLocation(companyId, lid);
        // One retry on 429.
        if (verdict.verdict === "fetch_failed" && /429/.test(verdict.detail)) {
          await new Promise((r) => setTimeout(r, 1500));
          verdict = await resolveGhlAdminForLocation(companyId, lid);
        }

        if (verdict.verdict !== "admin") {
          const reason =
            verdict.verdict === "no_admin" ? "no_ghl_admin" :
            verdict.verdict === "unresolved" ? "multiple_unresolved" :
            `fetch_failed: ${verdict.detail.slice(0, 200)}`;
          if (!dryRun) {
            await admin.from("manual_review_queue").upsert({
              location_id: lid,
              location_name: loc.location_name,
              ghl_company_id: companyId,
              reason,
              current_owner_user_id: curOwnerId,
              ghl_users_snapshot: verdict.verdict === "unresolved" ? verdict.admins : null,
              status: "pending",
            }, { onConflict: "location_id", ignoreDuplicates: false });
            await admin.from("ownership_audit_log").insert({
              location_id: lid, action: "queue_manual",
              old_owner_user_id: curOwnerId,
              executed_by: "apply-ownership-patch",
              detail: { reason },
            });
          }
          outcomes.push({ location_id: lid, action: "queue_manual", old_owner_user_id: curOwnerId, detail: reason });
          continue;
        }

        const adminUser = verdict.user;
        const adminEmail = adminUser.email;
        // Check if current owner matches the GHL admin (by email, since GHL
        // user id != supabase user id).
        if (curOwnerEmail && adminEmail && curOwnerEmail.toLowerCase() === adminEmail.toLowerCase()) {
          outcomes.push({ location_id: lid, action: "skip_correct", old_owner_user_id: curOwnerId, ghl_admin_email: adminEmail });
          continue;
        }

        if (dryRun) {
          outcomes.push({
            location_id: lid,
            action: curOwnerId ? "reassign" : "insert",
            old_owner_user_id: curOwnerId,
            ghl_admin_email: adminEmail,
            detail: "dry_run",
          });
          continue;
        }

        // Provision GHL admin auth/profile.
        const newOwnerId = await provisionAuthUserByEmail(
          admin, adminEmail, ghlUserDisplayName(adminUser), adminUser.id,
        );
        if (!newOwnerId) {
          await admin.from("manual_review_queue").upsert({
            location_id: lid, location_name: loc.location_name,
            ghl_company_id: companyId, reason: "ghl_admin_no_email",
            current_owner_user_id: curOwnerId, ghl_users_snapshot: adminUser,
            status: "pending",
          }, { onConflict: "location_id", ignoreDuplicates: false });
          outcomes.push({ location_id: lid, action: "queue_manual", detail: "ghl_admin_no_email" });
          continue;
        }

        // Upsert link.
        await admin.from("ghl_location_links").upsert({
          user_id: newOwnerId,
          workspace_owner_user_id: newOwnerId,
          linked_by_user_id: newOwnerId,
          ghl_location_id: lid,
          ghl_company_id: companyId,
          ghl_location_name: loc.location_name,
        }, { onConflict: "user_id,ghl_location_id", ignoreDuplicates: true });

        // Update any existing links to point to the new owner (so RLS/owner
        // checks elsewhere see consistent state).
        await admin.from("ghl_location_links")
          .update({ workspace_owner_user_id: newOwnerId })
          .eq("ghl_location_id", lid)
          .neq("workspace_owner_user_id", newOwnerId);

        // Insert/promote new owner membership.
        await admin.from("location_memberships").upsert(
          { location_id: lid, user_id: newOwnerId, role: "owner", is_owner: true },
          { onConflict: "location_id,user_id" },
        );

        // Demote old wrong owner to member (do NOT delete).
        if (curOwnerId && curOwnerId !== newOwnerId) {
          await admin.from("location_memberships")
            .update({ role: "member", is_owner: false })
            .eq("location_id", lid)
            .eq("user_id", curOwnerId);
        }

        const action: "insert" | "reassign" = curOwnerId ? "reassign" : "insert";
        await admin.from("ownership_audit_log").insert({
          location_id: lid, action,
          old_owner_user_id: curOwnerId,
          new_owner_user_id: newOwnerId,
          ghl_admin_user_id: adminUser.id,
          ghl_admin_email: adminEmail,
          executed_by: "apply-ownership-patch",
          detail: { location_name: loc.location_name },
        });
        outcomes.push({ location_id: lid, action, old_owner_user_id: curOwnerId, new_owner_user_id: newOwnerId, ghl_admin_email: adminEmail });
      } catch (e: any) {
        outcomes.push({ location_id: lid, action: "error", detail: e?.message ?? "err" });
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const summary = {
    company: companyId,
    dryRun,
    total: outcomes.length,
    skip_correct: outcomes.filter((o) => o.action === "skip_correct").length,
    insert: outcomes.filter((o) => o.action === "insert").length,
    reassign: outcomes.filter((o) => o.action === "reassign").length,
    queue_manual: outcomes.filter((o) => o.action === "queue_manual").length,
    error: outcomes.filter((o) => o.action === "error").length,
  };
  return json({ summary, outcomes });
});

function json(o: unknown, status = 200) {
  return new Response(JSON.stringify(o), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
