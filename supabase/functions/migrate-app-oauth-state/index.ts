// TEMPORARY one-off migration function.
// Copies public.oauth_clients and public.oauth_access_tokens from the source
// project to a destination project. Read-only against the source. Never
// overwrites or deletes destination rows (plain INSERT, no upsert).
// Never logs or returns secrets, tokens, ids, or row contents.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-migration-token",
};

const PAGE = 200;
const TIME_BUDGET_MS = 110_000;
const TABLES = [
  { table: "oauth_clients", countCol: "client_id" },
  { table: "oauth_access_tokens", countCol: "access_token" },
] as const;

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isDuplicate(err: { code?: string; message?: string } | null) {
  if (!err) return false;
  if (err.code === "23505") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("duplicate key") || m.includes("already exists");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const expected = Deno.env.get("STORAGE_MIGRATION_TOKEN");
  const provided = req.headers.get("x-migration-token");
  if (!expected || !provided || provided !== expected) {
    return j({ error: "unauthorized" }, 401);
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
  const results: Record<string, unknown> = {};
  let anyTruncated = false;

  for (const { table, countCol } of TABLES) {
    const { count: source_count, error: srcCountErr } = await src
      .from(table)
      .select(countCol, { count: "exact", head: true });
    if (srcCountErr) return j({ error: "source_count_failed", table }, 500);

    const { count: destination_count_before, error: destCountErr } = await dest
      .from(table)
      .select(countCol, { count: "exact", head: true });
    if (destCountErr) return j({ error: "destination_count_failed", table }, 500);

    let copied = 0, skipped_existing = 0, failed = 0, truncated = false;
    let offset = 0;

    outer: for (;;) {
      const { data: rows, error } = await src
        .from(table)
        .select("*")
        .order("created_at", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) return j({ error: "source_read_failed", table }, 500);
      const batch = rows ?? [];
      if (batch.length === 0) break;

      for (const row of batch) {
        if (Date.now() - started > TIME_BUDGET_MS) { truncated = true; break outer; }
        const { error: insErr } = await dest.from(table).insert(row);
        if (!insErr) copied++;
        else if (isDuplicate(insErr)) skipped_existing++;
        else failed++;
      }

      if (batch.length < PAGE) break;
      offset += PAGE;
    }

    const { count: destination_count_after } = await dest
      .from(table)
      .select(countCol, { count: "exact", head: true });

    if (truncated) anyTruncated = true;
    results[table] = {
      truncated,
      source_count: source_count ?? 0,
      destination_count_before: destination_count_before ?? 0,
      copied,
      skipped_existing,
      failed,
      destination_count_after: destination_count_after ?? 0,
    };
  }

  return j({ ok: true, truncated: anyTruncated, tables: results });
});
