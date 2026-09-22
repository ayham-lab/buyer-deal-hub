// TEMPORARY one-off storage migration function.
// Copies every object from the source project's buckets to a destination
// project. Read-only against the source: never deletes or modifies source
// objects or any database records. Safe to re-run (upsert: false).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-migration-token",
};

const BUCKETS = ["buyer-pof", "deal-files", "deal-marketing"];
const PAGE = 100;
const CONCURRENCY = 4;
const TIME_BUDGET_MS = 110_000;

function j(o: unknown, s = 200) {
  return new Response(JSON.stringify(o), {
    status: s,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type Client = ReturnType<typeof createClient>;

async function listAll(src: Client, bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await src.storage
      .from(bucket)
      .list(prefix, { limit: PAGE, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    const rows = data ?? [];
    for (const row of rows) {
      const path = prefix ? `${prefix}/${row.name}` : row.name;
      // Folders come back with a null id.
      if (row.id === null) out.push(...(await listAll(src, bucket, path)));
      else out.push(path);
    }
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  return out;
}

function isAlreadyExists(err: { message?: string; statusCode?: string } | null) {
  const m = `${err?.message ?? ""} ${err?.statusCode ?? ""}`.toLowerCase();
  return m.includes("already exists") || m.includes("duplicate") || m.includes("409");
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
  );
  const dest = createClient(destUrl, destKey);

  const started = Date.now();
  let truncated = false;
  const results: Record<string, unknown> = {};

  for (const bucket of BUCKETS) {
    let discovered = 0, copied = 0, skipped_existing = 0, failed = 0;
    const failed_paths: { path: string; error: string }[] = [];

    let paths: string[] = [];
    try {
      paths = await listAll(src, bucket);
    } catch (e) {
      results[bucket] = { discovered: 0, copied: 0, skipped_existing: 0, failed: 0, failed_paths: [], error: String((e as Error).message) };
      continue;
    }
    discovered = paths.length;

    let cursor = 0;
    const worker = async () => {
      for (;;) {
        if (Date.now() - started > TIME_BUDGET_MS) { truncated = true; return; }
        const i = cursor++;
        if (i >= paths.length) return;
        const path = paths[i];
        try {
          const dl = await src.storage.from(bucket).download(path);
          if (dl.error || !dl.data) throw new Error(dl.error?.message ?? "download failed");
          const blob = dl.data;
          const up = await dest.storage.from(bucket).upload(path, blob, {
            contentType: blob.type || "application/octet-stream",
            upsert: false,
          });
          if (up.error) {
            if (isAlreadyExists(up.error as never)) skipped_existing++;
            else { failed++; failed_paths.push({ path, error: up.error.message }); }
          } else copied++;
        } catch (e) {
          failed++;
          failed_paths.push({ path, error: String((e as Error).message) });
        }
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    results[bucket] = { discovered, copied, skipped_existing, failed, failed_paths };
    if (truncated) break;
  }

  return j({ ok: true, truncated, elapsed_ms: Date.now() - started, buckets: results });
});
