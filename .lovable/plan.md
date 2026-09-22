# Temporary storage migration function

Create a one-off backend function, `migrate-storage`, that copies every stored file from this project to another project. It only reads here and writes there — nothing is deleted or changed on this side, and no database records are touched.

## What it does

1. Rejects any request whose `x-migration-token` header does not exactly match the stored migration token (401).
2. For each of the three buckets — `buyer-pof`, `deal-files`, `deal-marketing` — walks the whole folder tree, page by page (100 per page), collecting every object path.
3. Downloads each object from this project and uploads it to the same bucket and same path in the destination project, keeping its content type.
4. Uses no-overwrite mode: if a file already exists at that path in the destination, it is left alone and counted as skipped.
5. Returns a JSON report per bucket: discovered, copied, skipped-existing, failed — plus the list of failed paths.

## Access details it needs

Three values must be saved before it can run:

- `STORAGE_MIGRATION_TOKEN` — the shared value you send in the request header.
- `MIGRATION_DEST_SUPABASE_URL` — the destination project's API URL.
- `MIGRATION_DEST_SERVICE_ROLE_KEY` — the destination project's service role key.

Source credentials are already available to backend functions automatically. The destination buckets must already exist there; the function does not create them.

## Technical notes

- New file: `supabase/functions/migrate-storage/index.ts`; add `verify_jwt = false` for it in `supabase/config.toml` (token check is done in code).
- Source client: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`. Destination client: the two migration env vars.
- Recursive listing via `storage.from(bucket).list(prefix, { limit: 100, offset })`; entries with a null `id` are folders and are recursed into.
- Copy loop: `download(path)` → `upload(path, blob, { contentType: blob.type, upsert: false })`. An upload error whose message/status indicates the resource already exists counts as skipped-existing, not failed.
- Sequential copies with a small concurrency cap (e.g. 4) to stay within the function time budget; response includes `truncated: true` if the run is stopped early so it can be re-invoked safely (re-runs skip what already landed).
- CORS headers on all responses, including errors.
- Delete the function after the migration is complete.
