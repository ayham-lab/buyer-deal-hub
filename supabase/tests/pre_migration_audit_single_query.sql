-- ============================================================================
-- READ-ONLY pre-migration audit -- SINGLE STATEMENT version.
--
-- Use this one in the Supabase SQL editor (or any non-psql client). It is one
-- statement returning one table, so nothing is lost to "only the last result is
-- shown", and it contains no psql backslash meta-commands.
--
-- (supabase/tests/pre_migration_audit.sql is the psql-only equivalent, which
--  additionally prints the multi-row detail listings.)
--
-- Nothing here writes. Read the `gate` column first:
--     BLOCKER  -> must be resolved before applying the migrations
--     EXPORT   -> save this result before applying; the migration deletes or
--                 overwrites these rows and it cannot be undone
--     info     -> context
--
-- Run BEFORE:
--   20260807090000_tighten_definer_rpcs_and_pii_exposure.sql
--   20260807090100_referential_integrity_and_retire_buyer_archive.sql
-- ============================================================================
WITH checks AS (

  -- ── A1. Orphans. These rows are DELETED by migration 2. ──────────────────
  SELECT 1 AS ord, 'EXPORT' AS gate, 'A1 orphan deal_activity.deal_id' AS finding,
         count(*)::text AS value
    FROM public.deal_activity a
   WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = a.deal_id)
  UNION ALL
  SELECT 2, 'EXPORT', 'A1 orphan deal_assignees.deal_id', count(*)::text
    FROM public.deal_assignees x
   WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id)
  UNION ALL
  SELECT 3, 'EXPORT', 'A1 orphan deal_assignees.team_member_id', count(*)::text
    FROM public.deal_assignees x
   WHERE NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = x.team_member_id)
  UNION ALL
  SELECT 4, 'EXPORT', 'A1 orphan archive_buyer_reveals.buyer_id', count(*)::text
    FROM public.archive_buyer_reveals r
   WHERE NOT EXISTS (SELECT 1 FROM public.archive_buyers b WHERE b.id = r.buyer_id)

  -- ── A2. Do these FKs already exist? (schema drift from the migrations) ───
  UNION ALL
  SELECT 5, 'info', 'A2 pre-existing FKs on those 3 tables',
         coalesce(string_agg(conname, ', '), 'none')
    FROM pg_constraint
   WHERE contype = 'f'
     AND conrelid IN ('public.deal_activity'::regclass,
                      'public.deal_assignees'::regclass,
                      'public.archive_buyer_reveals'::regclass)

  -- ── A3. Sizes, for the VALIDATE CONSTRAINT lock window ───────────────────
  UNION ALL
  SELECT 6, 'info', 'A3 table sizes (live rows / total)',
         coalesce(string_agg(c.relname || '=' || s.n_live_tup || ' (' ||
                  pg_size_pretty(pg_total_relation_size(c.oid)) || ')',
                  ', ' ORDER BY pg_total_relation_size(c.oid) DESC), 'n/a')
    FROM pg_class c JOIN pg_stat_user_tables s ON s.relid = c.oid
   WHERE c.relname IN ('deal_activity','deal_assignees','archive_buyer_reveals','deals',
                       'team_members','archive_buyers','title_companies',
                       'oauth_install_log','webhook_debug_log','profiles')

  -- ── A4. Duplicate profile emails ─────────────────────────────────────────
  UNION ALL
  SELECT 7, 'info', 'A4 duplicate lower(profiles.email) groups',
         coalesce((SELECT count(*)::text FROM (
             SELECT lower(email) FROM public.profiles
              WHERE email IS NOT NULL AND btrim(email) <> ''
              GROUP BY 1 HAVING count(*) > 1) z), '0')
  UNION ALL
  SELECT 8, 'info', 'A4 which emails are duplicated',
         coalesce((SELECT string_agg(e, ', ') FROM (
             SELECT lower(email) AS e FROM public.profiles
              WHERE email IS NOT NULL AND btrim(email) <> ''
              GROUP BY 1 HAVING count(*) > 1 LIMIT 25) z), 'none')

  -- ── A5/A6. profiles.email drift and live impersonation setups ────────────
  UNION ALL
  SELECT 9, 'EXPORT', 'A5 profiles.email drifted from auth.users.email', count(*)::text
    FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
   WHERE lower(coalesce(p.email,'')) IS DISTINCT FROM lower(coalesce(u.email,''))
  UNION ALL
  SELECT 10, 'EXPORT',
         'A6 profiles holding ANOTHER user''s auth email (live impersonation)',
         count(*)::text
    FROM public.profiles p
    JOIN auth.users u ON lower(u.email) = lower(p.email) AND u.id <> p.user_id

  -- ── A7. oauth_install_log credential inventory ───────────────────────────
  UNION ALL
  SELECT 11, 'EXPORT', 'A7 oauth_install_log rows / rows holding secrets',
         count(*)::text || ' / ' ||
         count(*) FILTER (
           WHERE jsonb_typeof(payload) = 'object'
             AND payload ?| ARRAY['access_token','refresh_token','accessToken',
                                  'refreshToken','id_token','idToken','token',
                                  'client_secret','clientSecret']
         )::text
    FROM public.oauth_install_log
  UNION ALL
  SELECT 12, 'info', 'A7 payload keys seen (confirms redaction list is complete)',
         coalesce((SELECT string_agg(DISTINCT k, ', ')
                     FROM public.oauth_install_log,
                          LATERAL jsonb_object_keys(payload) k
                    WHERE jsonb_typeof(payload) = 'object'), 'none')

  -- ── A8. THE BLOCKING GATE ────────────────────────────────────────────────
  UNION ALL
  SELECT 13, 'BLOCKER',
         'A8 locations needing backfill-missing-tokens FIRST (MUST BE 0)',
         count(DISTINCT l.location_id)::text
    FROM public.oauth_install_log l
   WHERE l.location_id IS NOT NULL
     AND jsonb_typeof(l.payload) = 'object'
     AND coalesce(l.payload->>'refresh_token', l.payload->>'refreshToken') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.ghl_location_tokens t
                      WHERE t.ghl_location_id = l.location_id)

  -- ── A9. webhook_debug_log ────────────────────────────────────────────────
  UNION ALL
  SELECT 14, 'info', 'A9 webhook_debug_log rows / holding credential headers',
         count(*)::text || ' / ' ||
         count(*) FILTER (
           WHERE jsonb_typeof(headers) = 'object'
             AND (SELECT bool_or(lower(k) IN ('authorization','x-ghl-sso','cookie',
                                              'apikey','x-api-key','x-supabase-auth'))
                    FROM jsonb_object_keys(headers) k)
         )::text
    FROM public.webhook_debug_log
  UNION ALL
  SELECT 15, 'info', 'A9 webhook_debug_log rows older than 30d / total size',
         (SELECT count(*) FROM public.webhook_debug_log
           WHERE received_at < now() - interval '30 days')::text
         || ' / ' || pg_size_pretty(pg_total_relation_size('public.webhook_debug_log'))

  -- ── A10. Title-company leak blast radius + the broken ACL ────────────────
  UNION ALL
  SELECT 16, 'info', 'A10 title_companies rows / distinct owners / distinct tenants',
         count(*)::text || ' / ' || count(DISTINCT user_id)::text || ' / ' ||
         count(DISTINCT ghl_location_id)::text
    FROM public.title_companies
  UNION ALL
  SELECT 17, 'info', 'A10 active curated archive_title_companies', count(*)::text
    FROM public.archive_title_companies WHERE is_active
  UNION ALL
  SELECT 18, 'info',
         'A10 anon can EXECUTE list_title_company_archive (true = the ACL bug)',
         has_function_privilege('anon','public.list_title_company_archive()','EXECUTE')::text
  UNION ALL
  SELECT 19, 'info',
         'A10 anon can EXECUTE archive_buyer_distinct_sources',
         has_function_privilege('anon','public.archive_buyer_distinct_sources()','EXECUTE')::text

  -- ── A11. Are the curated contact catalogs tenant-derived? ────────────────
  UNION ALL
  SELECT 20, 'info', 'A11 archive_realtors total / with email / overlapping tenant rows',
         (SELECT count(*) FROM public.archive_realtors)::text || ' / ' ||
         (SELECT count(*) FROM public.archive_realtors WHERE email IS NOT NULL)::text || ' / ' ||
         (SELECT count(*) FROM public.archive_realtors a
           WHERE a.email IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.realtors r
                          WHERE lower(r.email) = lower(a.email)))::text
  UNION ALL
  SELECT 21, 'info', 'A11 archive_notaries total / with email / overlapping tenant rows',
         (SELECT count(*) FROM public.archive_notaries)::text || ' / ' ||
         (SELECT count(*) FROM public.archive_notaries WHERE email IS NOT NULL)::text || ' / ' ||
         (SELECT count(*) FROM public.archive_notaries a
           WHERE a.email IS NOT NULL
             AND EXISTS (SELECT 1 FROM public.notaries n
                          WHERE lower(n.email) = lower(a.email)))::text

  -- ── A12. buyer_archive retirement sizing ─────────────────────────────────
  -- Catalog-only on purpose, so this statement still parses after migration 2
  -- has dropped the table. reltuples is a planner ESTIMATE; for the exact count
  -- run `SELECT count(*) FROM public.buyer_archive;` separately before dropping.
  UNION ALL
  SELECT 22, 'EXPORT', 'A12 buyer_archive still exists / estimated rows',
         (to_regclass('public.buyer_archive') IS NOT NULL)::text || ' / ' ||
         coalesce((SELECT CASE
                            WHEN c.reltuples < 0 THEN 'unknown (never analyzed)'
                            ELSE '~' || c.reltuples::bigint::text
                          END
                     FROM pg_class c
                    WHERE c.oid = to_regclass('public.buyer_archive')), 'n/a')
  UNION ALL
  SELECT 23, 'info', 'A12 inbound FKs to buyer_archive (expect none)',
         coalesce((SELECT string_agg(conname, ', ') FROM pg_constraint
                    WHERE confrelid = to_regclass('public.buyer_archive')), 'none')

  -- ── A14. deals.owner_id id-space split (report only) ─────────────────────
  UNION ALL
  SELECT 24, 'info',
         'A14 deals.owner_id: unset / auth-user id / team_member id / neither',
         count(*) FILTER (WHERE owner_id IS NULL)::text || ' / ' ||
         count(*) FILTER (WHERE owner_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = d.owner_id))::text || ' / ' ||
         count(*) FILTER (WHERE owner_id IS NOT NULL
                AND EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = d.owner_id))::text || ' / ' ||
         count(*) FILTER (WHERE owner_id IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = d.owner_id)
                AND NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = d.owner_id))::text
    FROM public.deals d
)
SELECT gate, finding, value
  FROM checks
 ORDER BY ord;
