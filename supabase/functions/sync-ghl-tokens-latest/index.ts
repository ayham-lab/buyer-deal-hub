// TEMPORARY one-off sync function.
// Refreshes destination public.ghl_location_tokens rows from the source project.
// Matching: by ghl_location_id when non-null, otherwise (company-only rows) by
// ghl_company_id where ghl_location_id is null. Destination row ids are never
// changed. Rows are never deleted. The source database is never modified.
// Never logs or returns tokens, row contents, UUIDs, company ids or location ids.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-migration-token",
};

const PAGE = 200;
const TIME_BUDGET_MS = 110_000;

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Row = Record<string, unknown>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("STORAGE_MIGRATION_TOKEN");
  const provided = req.headers.get("x-migration-token");
  if (!expected || !provided || provided !== expected) {
    return j({ error: "unauthorized" }, 401);
  }

  let mode = "newer_only";
  try {
    const body = await req.json();
    if (body && typeof body.mode === "string") mode = body.mode;
  } catch {
    // no body -> default mode
  }
  if (mode !== "force_source" && mode !== "newer_only") {
    return j({ error: "invalid_mode", allowed: ["force_source", "newer_only"] }, 400);
  }

  const destUrl = Deno.env.get("MIGRATION_DEST_SUPABASE_URL");
  const destKey = Deno.env.get("MIGRATION_DEST_SERVICE_ROLE_KEY");
  if (!destUrl || !destKey) return j({ error: "destination_not_configured" }, 500);

  const src = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const dest = createClient(destUrl, destKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const started = Date.now();

  const { count: source_count, error: srcCountErr } = await src
    .from("ghl_location_tokens")
    .select("id", { count: "exact", head: true });
  if (srcCountErr) return j({ error: "source_count_failed" }, 500);

  let inserted = 0, updated = 0, skipped_not_newer = 0, failed = 0;
  let truncated = false;
  let offset = 0;

  outer: for (;;) {
    const { data: rows, error } = await src
      .from("ghl_location_tokens")
      .select("*")
      .order("created_at", { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) return j({ error: "source_read_failed" }, 500);
    const batch = (rows ?? []) as Row[];
    if (batch.length === 0) break;

    for (const row of batch) {
      if (Date.now() - started > TIME_BUDGET_MS) { truncated = true; break outer; }

      const locId = row.ghl_location_id as string | null;
      const compId = row.ghl_company_id as string | null;

      // Build the destination match filter.
      let matchQuery = dest.from("ghl_location_tokens").select("id, updated_at").limit(1);
      if (locId != null) {
        matchQuery = matchQuery.eq("ghl_location_id", locId);
      } else if (compId != null) {
        matchQuery = matchQuery.is("ghl_location_id", null).eq("ghl_company_id", compId);
      } else {
        failed++;
        continue;
      }

      const { data: found, error: matchErr } = await matchQuery;
      if (matchErr) { failed++; continue; }

      const existing = found && found.length > 0 ? found[0] as Row : null;

      if (!existing) {
        const { error: insErr } = await dest.from("ghl_location_tokens").insert(row);
        if (insErr) failed++; else inserted++;
        continue;
      }

      if (mode === "newer_only") {
        const srcUpd = row.updated_at ? Date.parse(String(row.updated_at)) : NaN;
        const dstUpd = existing.updated_at ? Date.parse(String(existing.updated_at)) : NaN;
        if (!Number.isNaN(srcUpd) && !Number.isNaN(dstUpd) && srcUpd <= dstUpd) {
          skipped_not_newer++;
          continue;
        }
        if (Number.isNaN(srcUpd)) { skipped_not_newer++; continue; }
      }

      // Copy every source column except the primary key: destination id is preserved.
      const patch: Row = { ...row };
      delete patch.id;

      const { error: updErr } = await dest
        .from("ghl_location_tokens")
        .update(patch)
        .eq("id", existing.id as string);
      if (updErr) failed++; else updated++;
    }

    if (batch.length < PAGE) break;
    offset += PAGE;
  }

  const { count: destination_count } = await dest
    .from("ghl_location_tokens")
    .select("id", { count: "exact", head: true });

  return j({
    ok: true,
    mode,
    truncated,
    source_count: source_count ?? 0,
    inserted,
    updated,
    skipped_not_newer,
    failed,
    destination_count: destination_count ?? 0,
  });
});
