-- ============================================================================
-- Close the leaks that RLS cannot reach, and stop logging credentials.
--
-- BACKGROUND
--   20260806090000 made the client-supplied x-ghl-location-id header unable to
--   GRANT access. That fixed everything that flows through RLS. Two paths do
--   not flow through RLS and were therefore untouched:
--
--   1. SECURITY DEFINER RPCs bypass RLS by design. list_title_company_archive()
--      did `UNION ALL SELECT ... FROM public.title_companies` with NO WHERE
--      clause, returning every tenant's private title-company rolodex --
--      contact_name, email, phone, address, notes -- to any caller. Its ACL had
--      also silently reverted to EXECUTE TO PUBLIC, because 20260524192026 ran
--      DROP FUNCTION + CREATE without re-applying the REVOKE/GRANT from
--      20260517233329.
--
--   2. Log tables store raw payloads. oauth_install_log.payload holds plaintext
--      access_token / refresh_token, and its policy let any tenant read rows for
--      their own location -- defeating the deliberate
--      REVOKE SELECT (access_token, refresh_token) ON ghl_location_tokens.
--      webhook_debug_log.headers holds whatever the caller sent, including
--      Authorization and x-ghl-sso.
--
-- DELIBERATELY UNCHANGED
--   * Standalone mode (no header) and every current_ghl_location() IS NULL
--     branch, exactly as 20260806090000 preserved them.
--   * admin / super_admin reach.
--   * The "Used by N" usage aggregate on the title-company archive: cross-tenant
--     discovery is kept, only the contact fields are withheld.
--   * The edge functions. The redaction is enforced by triggers, so
--     ghl-opportunity-webhook and the OAuth callbacks need no code change.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 1. list_title_company_archive(): scope the tenant half, keep discovery.
--
--    Stays SECURITY DEFINER on purpose -- archive_title_companies is
--    super_admin-only RLS, so an INVOKER version would return zero curated rows
--    and the feature would die; and the usage aggregate has to span all tenants,
--    which an invoker can never see. Because DEFINER bypasses RLS, the tenant
--    scoping is written explicitly into the body below.
--
--    Visibility rules:
--      archive   -> curated rows, full detail (shared by design)
--      user      -> the caller's own rows, full detail
--      community -> everyone else's rows: business identity only. contact_name,
--                   email, phone, address and notes are forced to NULL.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.list_title_company_archive();

CREATE OR REPLACE FUNCTION public.list_title_company_archive()
RETURNS TABLE(
  id uuid, source text, name text, contact_name text, email text, phone text, address text,
  service_states text[], service_cities text[],
  charges_file_fee boolean, file_fee_amount numeric,
  deal_types text[], notes text, entity_type text, usage_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH me AS (
    SELECT auth.uid() AS uid, public.current_ghl_location() AS loc
  ),
  -- AGGREGATES ONLY. These two CTEs read every tenant's rows but emit nothing
  -- except a count per dedup key, so no tenant row can escape through them.
  arch_usage AS (
    SELECT lower(trim(a.name)) || '|' ||
           regexp_replace(coalesce(a.phone,''), '\D', '', 'g') AS k,
           count(*)::bigint AS n
      FROM public.archive_title_companies a
     WHERE a.is_active = true
     GROUP BY 1
  ),
  user_usage AS (
    SELECT lower(trim(t.name)) || '|' ||
           regexp_replace(coalesce(t.phone,''), '\D', '', 'g') AS k,
           count(*)::bigint AS n
      FROM public.title_companies t
     GROUP BY 1
  ),
  -- Rows are carried UNMASKED through dedup so the grouping key stays exactly
  -- what it was before (name + phone digits). Masking is applied once, on
  -- output, based on `source` -- otherwise a community row's NULLed phone would
  -- change its key and split it from the archive row it should merge with.
  visible AS (
    -- curated archive: full detail
    SELECT a.id, 'archive'::text AS source, 0 AS pref,
           a.name, a.contact_name, a.email, a.phone, a.address,
           a.service_states, a.service_cities, a.charges_file_fee, a.file_fee_amount,
           a.deal_types, a.notes, a.entity_type, a.updated_at AS sort_at
      FROM public.archive_title_companies a, me
     WHERE a.is_active = true AND me.uid IS NOT NULL

    UNION ALL

    -- the caller's own rows: full detail. Mirrors "TitleCo: scoped select".
    SELECT t.id, 'user'::text, 1,
           t.name, t.contact_name, t.email, t.phone, t.address,
           t.service_states, t.service_cities, t.charges_file_fee, t.file_fee_amount,
           t.deal_types, t.notes, t.entity_type, t.updated_at
      FROM public.title_companies t, me
     WHERE me.uid IS NOT NULL
       AND t.user_id = me.uid
       AND (me.loc IS NULL OR t.ghl_location_id = me.loc)

    UNION ALL

    -- everyone else's rows: kept for discovery, masked on output below.
    SELECT t.id, 'community'::text, 2,
           t.name, t.contact_name, t.email, t.phone, t.address,
           t.service_states, t.service_cities, t.charges_file_fee, t.file_fee_amount,
           t.deal_types, t.notes, t.entity_type, t.updated_at
      FROM public.title_companies t, me
     WHERE me.uid IS NOT NULL
       AND t.user_id IS DISTINCT FROM me.uid
  ),
  ranked AS (
    SELECT v.*,
           lower(trim(v.name)) || '|' ||
             regexp_replace(coalesce(v.phone,''), '\D', '', 'g') AS k,
           ROW_NUMBER() OVER (
             PARTITION BY lower(trim(v.name)) || '|' ||
                          regexp_replace(coalesce(v.phone,''), '\D', '', 'g')
             ORDER BY v.pref, v.sort_at DESC
           ) AS rn
      FROM visible v
  )
  SELECT r.id, r.source, r.name,
         CASE WHEN r.source = 'community' THEN NULL ELSE r.contact_name END,
         CASE WHEN r.source = 'community' THEN NULL ELSE r.email END,
         CASE WHEN r.source = 'community' THEN NULL ELSE r.phone END,
         CASE WHEN r.source = 'community' THEN NULL ELSE r.address END,
         r.service_states, r.service_cities, r.charges_file_fee, r.file_fee_amount,
         r.deal_types,
         CASE WHEN r.source = 'community' THEN NULL ELSE r.notes END,
         r.entity_type,
         (coalesce(au.n, 0) + coalesce(uu.n, 0))::bigint AS usage_count
    FROM ranked r
    LEFT JOIN arch_usage au ON au.k = r.k
    LEFT JOIN user_usage uu ON uu.k = r.k
   WHERE r.rn = 1
   ORDER BY usage_count DESC, r.name ASC;
$function$;

COMMENT ON FUNCTION public.list_title_company_archive() IS
  'SECURITY DEFINER: bypasses RLS, so tenant scoping lives in the body. Returns '
  'curated archive rows and the caller''s own title companies in full, and every '
  'other tenant''s rows as source=''community'' with contact fields NULLed. '
  'WARNING: DROP FUNCTION resets the ACL to EXECUTE TO PUBLIC -- any future '
  'redefinition MUST re-apply the REVOKE/GRANT below. That is how this leaked.';

REVOKE ALL     ON FUNCTION public.list_title_company_archive() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_title_company_archive() FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_title_company_archive() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 2. archive_buyer_distinct_sources(): documented super_admin-only since
--    20260515210354, but the body never checked. Return zero rows rather than
--    raising so the caller's `data ?? []` path is unaffected.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_buyer_distinct_sources()
RETURNS TABLE(source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT DISTINCT jsonb_array_elements_text(b.sources) AS source
    FROM public.archive_buyers b
   WHERE public.is_super_admin(auth.uid())
     AND jsonb_typeof(b.sources) = 'array'
   ORDER BY 1;
$function$;

REVOKE ALL     ON FUNCTION public.archive_buyer_distinct_sources() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.archive_buyer_distinct_sources() FROM anon;
GRANT  EXECUTE ON FUNCTION public.archive_buyer_distinct_sources() TO authenticated, service_role;


-- ---------------------------------------------------------------------------
-- 3. archive_realtors / archive_notaries: admin-only.
--
--    These carried `USING (auth.uid() IS NOT NULL AND is_active = true)` plus
--    GRANT SELECT TO authenticated, so every signed-up user could read the whole
--    global catalog including email and phone -- unlike archive_buyers, which is
--    super_admin + credit-gated reveal. All eight policies are also re-declared
--    with TO authenticated; they previously targeted PUBLIC (i.e. anon too),
--    which was only masked by the absence of an anon GRANT.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "ArchiveRealtors: read all auth"      ON public.archive_realtors;
DROP POLICY IF EXISTS "ArchiveRealtors: admin read"         ON public.archive_realtors;
DROP POLICY IF EXISTS "ArchiveRealtors: super_admin insert"  ON public.archive_realtors;
DROP POLICY IF EXISTS "ArchiveRealtors: super_admin update"  ON public.archive_realtors;
DROP POLICY IF EXISTS "ArchiveRealtors: super_admin delete"  ON public.archive_realtors;

CREATE POLICY "ArchiveRealtors: admin read" ON public.archive_realtors
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "ArchiveRealtors: super_admin insert" ON public.archive_realtors
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveRealtors: super_admin update" ON public.archive_realtors
  FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveRealtors: super_admin delete" ON public.archive_realtors
  FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

REVOKE ALL ON public.archive_realtors FROM anon;

DROP POLICY IF EXISTS "ArchiveNotaries: read all auth"      ON public.archive_notaries;
DROP POLICY IF EXISTS "ArchiveNotaries: admin read"         ON public.archive_notaries;
DROP POLICY IF EXISTS "ArchiveNotaries: super_admin insert"  ON public.archive_notaries;
DROP POLICY IF EXISTS "ArchiveNotaries: super_admin update"  ON public.archive_notaries;
DROP POLICY IF EXISTS "ArchiveNotaries: super_admin delete"  ON public.archive_notaries;

CREATE POLICY "ArchiveNotaries: admin read" ON public.archive_notaries
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "ArchiveNotaries: super_admin insert" ON public.archive_notaries
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveNotaries: super_admin update" ON public.archive_notaries
  FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveNotaries: super_admin delete" ON public.archive_notaries
  FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

REVOKE ALL ON public.archive_notaries FROM anon;


-- ---------------------------------------------------------------------------
-- 4. merge_audit_log: clarity fix, NOT a vulnerability.
--
--    "deny write" was declared FOR ALL, which includes SELECT, and permissive
--    policies OR together -- so it did nothing for reads. Writes were already
--    denied by the absence of any permissive write policy, so behaviour is
--    unchanged. Split per-command so the intent matches the effect, modelled on
--    ownership_audit_log (20260518213158).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "merge_audit_log: deny write"  ON public.merge_audit_log;
DROP POLICY IF EXISTS "merge_audit_log: deny insert" ON public.merge_audit_log;
DROP POLICY IF EXISTS "merge_audit_log: deny update" ON public.merge_audit_log;
DROP POLICY IF EXISTS "merge_audit_log: deny delete" ON public.merge_audit_log;

CREATE POLICY "merge_audit_log: deny insert" ON public.merge_audit_log
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "merge_audit_log: deny update" ON public.merge_audit_log
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "merge_audit_log: deny delete" ON public.merge_audit_log
  FOR DELETE TO authenticated, anon USING (false);


-- ---------------------------------------------------------------------------
-- 5. oauth_install_log: stop storing OAuth credentials, and stop tenants
--    reading the log at all.
--
--    PREREQUISITE: audit A8 must return 0. backfill-missing-tokens reads
--    payload->>'refresh_token' as its only input; redacting first would destroy
--    the recovery path for any location that still needs it.
--
--    NOTE: redaction hides the tokens, it does not invalidate them. If audit A7
--    showed secrets were present, rotate GHL_MARKETPLACE_CLIENT_SECRET and force
--    a refresh cycle after applying.
-- ---------------------------------------------------------------------------
UPDATE public.oauth_install_log
   SET payload = (payload
         - 'access_token'  - 'refresh_token' - 'accessToken' - 'refreshToken'
         - 'id_token'      - 'idToken'       - 'token'
         - 'client_secret' - 'clientSecret'  - 'apiKey'      - 'api_key')
         || jsonb_build_object('_redacted', true, '_redacted_at', now())
 WHERE jsonb_typeof(payload) = 'object'
   AND payload ?| ARRAY['access_token','refresh_token','accessToken','refreshToken',
                        'id_token','idToken','token','client_secret','clientSecret',
                        'apiKey','api_key'];

CREATE OR REPLACE FUNCTION public.redact_oauth_install_payload()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(NEW.payload) = 'object' THEN
    NEW.payload := NEW.payload
      - 'access_token'  - 'refresh_token' - 'accessToken' - 'refreshToken'
      - 'id_token'      - 'idToken'       - 'token'
      - 'client_secret' - 'clientSecret'  - 'apiKey'      - 'api_key';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_oauth_install_log_redact ON public.oauth_install_log;
CREATE TRIGGER trg_oauth_install_log_redact
  BEFORE INSERT OR UPDATE ON public.oauth_install_log
  FOR EACH ROW EXECUTE FUNCTION public.redact_oauth_install_payload();

-- Nothing in src/ reads this table; the per-location branch only ever served to
-- expose install payloads to tenants.
DROP POLICY IF EXISTS "oauth_install_log: scoped auth read" ON public.oauth_install_log;
DROP POLICY IF EXISTS "oauth_install_log: admin read"       ON public.oauth_install_log;
DROP POLICY IF EXISTS "oauth_install_log: deny insert"      ON public.oauth_install_log;
DROP POLICY IF EXISTS "oauth_install_log: deny update"      ON public.oauth_install_log;
DROP POLICY IF EXISTS "oauth_install_log: deny delete"      ON public.oauth_install_log;

CREATE POLICY "oauth_install_log: admin read" ON public.oauth_install_log
  FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));
CREATE POLICY "oauth_install_log: deny insert" ON public.oauth_install_log
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "oauth_install_log: deny update" ON public.oauth_install_log
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "oauth_install_log: deny delete" ON public.oauth_install_log
  FOR DELETE TO authenticated, anon USING (false);

REVOKE ALL ON public.oauth_install_log FROM anon;


-- ---------------------------------------------------------------------------
-- 6. webhook_debug_log: keep only headers that are useful for debugging.
--
--    Allow-list, not deny-list -- request headers are open-ended and a deny-list
--    misses the next credential header someone adds. ghl-opportunity-webhook
--    keeps writing the full header map; the trigger strips it at the door, so no
--    edge-function change is required.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.redact_request_headers(p jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p) <> 'object' THEN NULL
    ELSE coalesce(
      (SELECT jsonb_object_agg(e.k, e.v)
         FROM jsonb_each_text(p) AS e(k, v)
        WHERE lower(e.k) = ANY (ARRAY[
          'content-type','content-length','user-agent','accept','accept-encoding',
          'host','origin','referer','x-forwarded-for','x-real-ip',
          'x-forwarded-proto','x-request-id','cf-ray','cf-ipcountry'
        ])),
      '{}'::jsonb)
  END;
$$;

-- The historical sweep is DENY-LIST targeted, deliberately asymmetric with the
-- allow-list trigger below.
--
-- Applying the allow-list retroactively would match every row carrying any
-- non-allow-listed header -- i.e. essentially the whole table -- and this table
-- is large (production: ~372k rows / ~974 MB). That is a full rewrite, ~1 GB of
-- dead tuples and a likely statement timeout, in exchange for nothing: the
-- audit's A9 check reports 0 existing rows carrying a credential header.
--
-- So: only rewrite rows that actually leaked something. Future rows are still
-- allow-listed at the door by trg_webhook_debug_log_redact.
UPDATE public.webhook_debug_log
   SET headers = public.redact_request_headers(headers)
 WHERE jsonb_typeof(headers) = 'object'
   AND EXISTS (
     SELECT 1 FROM jsonb_object_keys(headers) k
      WHERE lower(k) IN ('authorization','proxy-authorization','x-forwarded-authorization',
                         'x-ghl-sso','cookie','set-cookie','apikey','x-api-key',
                         'x-supabase-auth','stripe-signature','x-webhook-signature')
   );

CREATE OR REPLACE FUNCTION public.redact_webhook_debug_row()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.headers := public.redact_request_headers(NEW.headers);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_webhook_debug_log_redact ON public.webhook_debug_log;
CREATE TRIGGER trg_webhook_debug_log_redact
  BEFORE INSERT OR UPDATE ON public.webhook_debug_log
  FOR EACH ROW EXECUTE FUNCTION public.redact_webhook_debug_row();

REVOKE ALL ON public.webhook_debug_log FROM anon;


-- ---------------------------------------------------------------------------
-- 7. Retention. Neither log table had any, and webhook_debug_log has no reader
--    in the application at all -- it is pure debug exhaust.
--
--    The pg_extension guard keeps this replayable on a bare Postgres (there is
--    no pg_cron anywhere in this repo's migrations; if the schedule matters in
--    production, verify it with `SELECT * FROM cron.job`).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_debug_logs(
  p_webhook_days integer DEFAULT 30,
  p_install_days integer DEFAULT 365
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n_w bigint; n_i bigint;
BEGIN
  DELETE FROM public.webhook_debug_log
   WHERE received_at < now() - make_interval(days => p_webhook_days);
  GET DIAGNOSTICS n_w = ROW_COUNT;

  DELETE FROM public.oauth_install_log
   WHERE created_at < now() - make_interval(days => p_install_days);
  GET DIAGNOSTICS n_i = ROW_COUNT;

  RETURN jsonb_build_object('webhook_debug_log', n_w, 'oauth_install_log', n_i);
END $$;

REVOKE ALL     ON FUNCTION public.purge_debug_logs(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.purge_debug_logs(integer, integer) TO service_role;

DO $sched$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-debug-logs') THEN
      PERFORM cron.unschedule('purge-debug-logs');
    END IF;
    PERFORM cron.schedule('purge-debug-logs', '17 4 * * *',
                          'SELECT public.purge_debug_logs();');
  END IF;
END
$sched$;


-- ---------------------------------------------------------------------------
-- 8. profiles.email: close the identity-confusion primitive.
--
--    _shared/resolveCaller.ts resolves a GHL SSO user by
--    `profiles.eq(email).maybeSingle()`. profiles.email had no uniqueness, no
--    index, and no column restriction -- and the UPDATE policy only constrains
--    WHICH ROW you may update, not which columns. So a user could point their
--    own profile at someone else's SSO email.
--
--    NOT a unique index, deliberately: it aborts this migration if production
--    has duplicates (audit A4), and once live it makes handle_new_user() raise
--    inside GoTrue signup, breaking registration. A column-level
--    REVOKE UPDATE (email) was also rejected -- it is a no-op while
--    `authenticated` holds table-level UPDATE, which Supabase grants by default.
--    The durable fix is the companion change to resolveCaller.ts, which resolves
--    identity from auth.users instead.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles (lower(email));

-- SECURITY INVOKER on purpose: inside a SECURITY DEFINER function current_user
-- is the function OWNER, so the role check would silently never match. PostgREST
-- does SET LOCAL ROLE authenticated, so current_user is correct here.
CREATE OR REPLACE FUNCTION public.profiles_pin_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;   -- pin silently: existing updates that echo email
  END IF;                     -- back must keep working
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_pin_email ON public.profiles;
CREATE TRIGGER trg_profiles_pin_email
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_pin_email();

-- profiles.email is a mirror of auth.users.email. src/pages/Profile.tsx changes
-- email via supabase.auth.updateUser(), which updates auth.users and never syncs
-- back -- so the mirror was already drifting. Without this, pinning the column
-- would freeze stale addresses permanently.
CREATE OR REPLACE FUNCTION public.sync_profile_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    UPDATE public.profiles
       SET email = NEW.email, updated_at = now()
     WHERE user_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_email_changed ON auth.users;
CREATE TRIGGER on_auth_user_email_changed
  AFTER UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_profile_email();

-- One-time reconciliation of existing drift (audit A5/A6 record the before state).
UPDATE public.profiles p
   SET email = u.email, updated_at = now()
  FROM auth.users u
 WHERE u.id = p.user_id
   AND p.email IS DISTINCT FROM u.email;
