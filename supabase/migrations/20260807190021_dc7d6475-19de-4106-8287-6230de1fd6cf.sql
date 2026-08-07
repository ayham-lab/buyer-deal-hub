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
  visible AS (
    SELECT a.id, 'archive'::text AS source, 0 AS pref,
           a.name, a.contact_name, a.email, a.phone, a.address,
           a.service_states, a.service_cities, a.charges_file_fee, a.file_fee_amount,
           a.deal_types, a.notes, a.entity_type, a.updated_at AS sort_at
      FROM public.archive_title_companies a, me
     WHERE a.is_active = true AND me.uid IS NOT NULL

    UNION ALL

    SELECT t.id, 'user'::text, 1,
           t.name, t.contact_name, t.email, t.phone, t.address,
           t.service_states, t.service_cities, t.charges_file_fee, t.file_fee_amount,
           t.deal_types, t.notes, t.entity_type, t.updated_at
      FROM public.title_companies t, me
     WHERE me.uid IS NOT NULL
       AND t.user_id = me.uid
       AND (me.loc IS NULL OR t.ghl_location_id = me.loc)

    UNION ALL

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
  'SECURITY DEFINER: bypasses RLS, so tenant scoping lives in the body. Any future redefinition MUST re-apply the REVOKE/GRANT below.';

REVOKE ALL     ON FUNCTION public.list_title_company_archive() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.list_title_company_archive() FROM anon;
GRANT  EXECUTE ON FUNCTION public.list_title_company_archive() TO authenticated, service_role;

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

CREATE INDEX IF NOT EXISTS profiles_email_lower_idx ON public.profiles (lower(email));

CREATE OR REPLACE FUNCTION public.profiles_pin_email()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email := OLD.email;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_profiles_pin_email ON public.profiles;
CREATE TRIGGER trg_profiles_pin_email
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_pin_email();

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

UPDATE public.profiles p
   SET email = u.email, updated_at = now()
  FROM auth.users u
 WHERE u.id = p.user_id
   AND p.email IS DISTINCT FROM u.email;