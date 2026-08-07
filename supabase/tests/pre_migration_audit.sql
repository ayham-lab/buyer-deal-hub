-- ============================================================================
-- READ-ONLY production audit.
--
-- ⚠ THIS FILE IS psql-ONLY. It uses \pset and \echo meta-commands, which the
--   Supabase SQL editor cannot parse ("syntax error at or near \"). It also
--   emits ~20 separate result sets, and most GUI clients show only the last.
--
--   In the Supabase dashboard, run this instead:
--       supabase/tests/pre_migration_audit_single_query.sql
--   which is one statement returning one table with the same findings.
--
-- Run this BEFORE applying
--   20260807090000_tighten_definer_rpcs_and_pii_exposure.sql
--   20260807090100_referential_integrity_and_retire_buyer_archive.sql
--
-- Every statement is SELECT-only; nothing here writes. Its purpose is to size
-- up the rows that the migrations delete or overwrite, so the migrations can be
-- applied knowing exactly what they will touch.
--
--   psql "$DATABASE_URL" -f supabase/tests/pre_migration_audit.sql
--
-- GATES -- do not apply the migrations until these hold:
--   A8  MUST be 0.  Non-zero => run the backfill-missing-tokens edge function
--                   first; the redaction destroys its only input.
--   A1  Export to CSV. Those rows are DELETED by migration 2.
--   A7  Non-zero rows_with_secrets => rotate GHL_MARKETPLACE_CLIENT_SECRET
--                   after applying; redaction hides the tokens, it does not
--                   invalidate them.
--   A4  Non-zero => a UNIQUE index on lower(email) cannot be built. (The
--                   migration deliberately creates a NON-unique index, so this
--                   is informational unless you later add the unique one.)
-- ============================================================================
\pset pager off
\timing off

\echo ''
\echo '=== A1. Orphan rows -- THESE WILL BE DELETED by migration 2. Export first. ==='
SELECT 'deal_activity.deal_id' AS fk, count(*) AS orphans
  FROM public.deal_activity a
 WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = a.deal_id)
UNION ALL
SELECT 'deal_assignees.deal_id', count(*)
  FROM public.deal_assignees x
 WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id)
UNION ALL
SELECT 'deal_assignees.team_member_id', count(*)
  FROM public.deal_assignees x
 WHERE NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = x.team_member_id)
UNION ALL
SELECT 'archive_buyer_reveals.buyer_id', count(*)
  FROM public.archive_buyer_reveals r
 WHERE NOT EXISTS (SELECT 1 FROM public.archive_buyers b WHERE b.id = r.buyer_id);

\echo ''
\echo '=== A2. Do any of these FKs already exist in prod? (drift from migrations) ==='
SELECT conrelid::regclass AS tbl, conname, confrelid::regclass AS ref, confdeltype, convalidated
  FROM pg_constraint
 WHERE contype = 'f'
   AND conrelid IN ('public.deal_activity'::regclass,
                    'public.deal_assignees'::regclass,
                    'public.archive_buyer_reveals'::regclass);

\echo ''
\echo '=== A3. Table sizes -- lock-window sizing for the VALIDATE CONSTRAINT scans ==='
SELECT c.relname, s.n_live_tup,
       pg_size_pretty(pg_total_relation_size(c.oid)) AS total
  FROM pg_class c JOIN pg_stat_user_tables s ON s.relid = c.oid
 WHERE c.relname IN ('deal_activity','deal_assignees','archive_buyer_reveals','deals',
                     'team_members','archive_buyers','title_companies',
                     'oauth_install_log','webhook_debug_log','profiles','buyer_archive')
 ORDER BY pg_total_relation_size(c.oid) DESC;

\echo ''
\echo '=== A4. Duplicate profiles.email -- non-zero blocks any future UNIQUE index ==='
SELECT lower(email) AS email_lc, count(*) AS n, array_agg(user_id) AS user_ids
  FROM public.profiles
 WHERE email IS NOT NULL AND btrim(email) <> ''
 GROUP BY 1 HAVING count(*) > 1
 ORDER BY n DESC;

\echo ''
\echo '=== A5. profiles.email drifted from auth.users.email (repaired by migration 1) ==='
SELECT p.user_id, p.email AS profile_email, u.email AS auth_email, p.updated_at
  FROM public.profiles p JOIN auth.users u ON u.id = p.user_id
 WHERE lower(coalesce(p.email,'')) IS DISTINCT FROM lower(coalesce(u.email,''))
 ORDER BY p.updated_at DESC;

\echo ''
\echo '=== A6. LIVE IMPERSONATION SETUPS: a profile holding someone ELSE''s auth email ==='
\echo '     Any row here is an active identity-confusion vector against resolveCaller.'
SELECT p.user_id AS impersonating_user, p.email, u.id AS true_owner_user_id
  FROM public.profiles p
  JOIN auth.users u ON lower(u.email) = lower(p.email) AND u.id <> p.user_id;

\echo ''
\echo '=== A7. oauth_install_log: plaintext credential inventory ==='
SELECT count(*) AS total_rows,
       count(*) FILTER (
         WHERE jsonb_typeof(payload) = 'object'
           AND payload ?| ARRAY['access_token','refresh_token','accessToken','refreshToken',
                                'id_token','idToken','token','client_secret','clientSecret']
       ) AS rows_with_secrets,
       count(DISTINCT location_id) AS distinct_locations,
       min(created_at) AS oldest, max(created_at) AS newest
  FROM public.oauth_install_log;

\echo '--- payload key histogram (confirms the redaction key list is complete) ---'
SELECT k, count(*) AS n
  FROM public.oauth_install_log, LATERAL jsonb_object_keys(payload) k
 WHERE jsonb_typeof(payload) = 'object'
 GROUP BY 1 ORDER BY 2 DESC;

\echo ''
\echo '=== A8. *** BLOCKING GATE *** MUST BE 0 before applying migration 1 ==='
\echo '     Non-zero => run supabase/functions/backfill-missing-tokens FIRST.'
\echo '     Redaction destroys the only source of these refresh tokens.'
SELECT count(DISTINCT l.location_id) AS locations_still_needing_backfill
  FROM public.oauth_install_log l
 WHERE l.location_id IS NOT NULL
   AND jsonb_typeof(l.payload) = 'object'
   AND coalesce(l.payload->>'refresh_token', l.payload->>'refreshToken') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.ghl_location_tokens t
                    WHERE t.ghl_location_id = l.location_id);

\echo ''
\echo '=== A9. webhook_debug_log: header inventory + retention sizing ==='
SELECT lower(k) AS header, count(*) AS n
  FROM public.webhook_debug_log, LATERAL jsonb_object_keys(headers) k
 WHERE jsonb_typeof(headers) = 'object'
 GROUP BY 1 ORDER BY 2 DESC;

SELECT count(*) AS total,
       count(*) FILTER (
         WHERE jsonb_typeof(headers) = 'object'
           AND (SELECT bool_or(lower(k) IN ('authorization','x-ghl-sso','cookie',
                                            'apikey','x-api-key','x-supabase-auth'))
                  FROM jsonb_object_keys(headers) k)
       ) AS rows_with_credentials,
       count(*) FILTER (WHERE received_at < now() - interval '30 days') AS older_than_30d,
       min(received_at) AS oldest, max(received_at) AS newest,
       pg_size_pretty(pg_total_relation_size('public.webhook_debug_log')) AS size
  FROM public.webhook_debug_log;

\echo ''
\echo '=== A10. Title-company leak blast radius + the broken function ACLs ==='
SELECT count(*) AS title_company_rows,
       count(DISTINCT user_id) AS distinct_owners,
       count(DISTINCT ghl_location_id) AS distinct_tenants
  FROM public.title_companies;

SELECT count(*) FILTER (WHERE is_active) AS active_curated_archive_rows
  FROM public.archive_title_companies;

\echo '--- proacl NULL == default EXECUTE TO PUBLIC == the bug ---'
SELECT p.proname, p.prosecdef AS is_security_definer,
       pg_get_userbyid(p.proowner) AS owner, p.proacl
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public'
   AND p.proname IN ('list_title_company_archive','archive_buyer_distinct_sources');

\echo ''
\echo '=== A11. Are the curated realtor/notary catalogs tenant-derived or genuinely curated? ==='
SELECT 'realtors' AS kind,
       (SELECT count(*) FROM public.archive_realtors) AS archive_rows,
       (SELECT count(*) FROM public.archive_realtors WHERE email IS NOT NULL) AS with_email,
       (SELECT count(*) FROM public.archive_realtors a
         WHERE a.email IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.realtors r
                        WHERE lower(r.email) = lower(a.email))) AS overlaps_tenant_rows
UNION ALL
SELECT 'notaries',
       (SELECT count(*) FROM public.archive_notaries),
       (SELECT count(*) FROM public.archive_notaries WHERE email IS NOT NULL),
       (SELECT count(*) FROM public.archive_notaries a
         WHERE a.email IS NOT NULL
           AND EXISTS (SELECT 1 FROM public.notaries n
                        WHERE lower(n.email) = lower(a.email)));

\echo ''
\echo '=== A12. buyer_archive retirement sizing -- pg_dump before migration 2 ==='
SELECT count(*) AS rows, min(created_at) AS oldest, max(created_at) AS newest
  FROM public.buyer_archive;
\echo '--- inbound FKs (expect zero rows) ---'
SELECT conname, conrelid::regclass AS referencing_table
  FROM pg_constraint WHERE confrelid = 'public.buyer_archive'::regclass;

\echo ''
\echo '=== A13. Policy baseline -- diff this against the same query after applying ==='
SELECT tablename, policyname, cmd, roles
  FROM pg_policies
 WHERE schemaname = 'public'
   AND tablename IN ('merge_audit_log','archive_realtors','archive_notaries',
                     'oauth_install_log','webhook_debug_log','profiles',
                     'title_companies','archive_title_companies','buyer_archive')
 ORDER BY tablename, cmd, policyname;

\echo ''
\echo '=== A14. deals.owner_id id-space classification (REPORT ONLY, no fix this round) ==='
\echo '     AddDealModal writes an auth-user id; DealDrawer writes a team_members id.'
SELECT count(*) FILTER (WHERE owner_id IS NULL)                          AS unset,
       count(*) FILTER (WHERE owner_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.profiles p
                           WHERE p.user_id = d.owner_id))                AS looks_like_auth_user,
       count(*) FILTER (WHERE owner_id IS NOT NULL
              AND EXISTS (SELECT 1 FROM public.team_members m
                           WHERE m.id = d.owner_id))                     AS looks_like_team_member,
       count(*) FILTER (WHERE owner_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = d.owner_id)
              AND NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = d.owner_id))
                                                                          AS matches_neither
  FROM public.deals d;

\echo ''
\echo '=== audit complete ==='
