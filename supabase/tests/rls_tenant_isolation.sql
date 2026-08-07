-- ============================================================================
-- Tenant-isolation regression test.
--
-- Invariant under test:
--   The client-supplied `x-ghl-location-id` header may NARROW access, never
--   GRANT it. Setting it to another tenant's location id must yield nothing.
--
-- Run against a local or branch database (never production -- it seeds rows,
-- though the whole run is wrapped in a transaction that is rolled back):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/rls_tenant_isolation.sql
--
-- Exits non-zero with the failing assertion if the invariant is violated.
-- ============================================================================
BEGIN;

SET session_replication_role = replica;   -- don't fire auth triggers while seeding

CREATE TEMP TABLE _t(label text, actual text, expected text) ON COMMIT DROP;
GRANT ALL ON _t TO authenticated;

-- ---- fixture -------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('aaaa1111-0000-0000-0000-00000000aaaa', 'rls-owner@test.invalid'),
  ('cccc3333-0000-0000-0000-00000000cccc', 'rls-outsider@test.invalid');

INSERT INTO public.profiles (user_id, email, name) VALUES
  ('aaaa1111-0000-0000-0000-00000000aaaa', 'rls-owner@test.invalid', 'Owner'),
  ('cccc3333-0000-0000-0000-00000000cccc', 'rls-outsider@test.invalid', 'Outsider');

INSERT INTO public.operator_accounts (id, name, owner_user_id)
VALUES ('0f0f0f0f-0000-0000-0000-00000000f00f', 'RLS Test Group', 'aaaa1111-0000-0000-0000-00000000aaaa');

INSERT INTO public.ghl_location_tokens
  (ghl_location_id, location_name, operator_account_id, activated_at, access_token, refresh_token, expires_at)
VALUES
  ('rls_locA', 'Victim',  '0f0f0f0f-0000-0000-0000-00000000f00f', now(), 'x','y', now() + interval '1 day'),
  ('rls_locC', 'Sibling', '0f0f0f0f-0000-0000-0000-00000000f00f', now(), 'x','y', now() + interval '1 day');

INSERT INTO public.location_memberships (location_id, user_id, role, is_owner) VALUES
  ('rls_locA', 'aaaa1111-0000-0000-0000-00000000aaaa', 'owner', true),
  ('rls_locC', 'aaaa1111-0000-0000-0000-00000000aaaa', 'owner', true);

INSERT INTO public.buyers (user_id, ghl_location_id, name)
VALUES ('aaaa1111-0000-0000-0000-00000000aaaa', 'rls_locA', 'Victim Buyer');
INSERT INTO public.deals (user_id, ghl_location_id, property_address, status)
VALUES (NULL, 'rls_locA', '1 Webhook Way', 'active');          -- webhook-created deal
INSERT INTO public.credit_balances (ghl_location_id, balance) VALUES ('rls_locA', 999);
INSERT INTO public.buyers (user_id, ghl_location_id, name)
VALUES ('aaaa1111-0000-0000-0000-00000000aaaa', 'rls_locC', 'Sibling Buyer');

INSERT INTO public.skiptrace_buyers (id, property_address, owner1_first, owner1_last)
VALUES ('5c0f0000-0000-0000-0000-00000000501f', '9 Private Rd', 'Jane', 'Doe');
INSERT INTO public.skiptrace_buyer_phones (buyer_id, phone)
VALUES ('5c0f0000-0000-0000-0000-00000000501f', '5559998888');

-- ---- second, unrelated tenant (rls_locB) ---------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('bbbb2222-0000-0000-0000-00000000bbbb', 'rls-tenantb@test.invalid');
INSERT INTO public.profiles (user_id, email, name) VALUES
  ('bbbb2222-0000-0000-0000-00000000bbbb', 'rls-tenantb@test.invalid', 'Tenant B');
INSERT INTO public.ghl_location_tokens
  (ghl_location_id, location_name, activated_at, access_token, refresh_token, expires_at)
VALUES ('rls_locB', 'Unrelated', now(), 'x','y', now() + interval '1 day');
INSERT INTO public.location_memberships (location_id, user_id, role, is_owner)
VALUES ('rls_locB', 'bbbb2222-0000-0000-0000-00000000bbbb', 'owner', true);

-- ---- title companies: one private per tenant, one shared name -------------
INSERT INTO public.title_companies (id, user_id, ghl_location_id, name, contact_name, email, phone, entity_type)
VALUES
  ('7c000000-0000-0000-0000-00000000a001', 'aaaa1111-0000-0000-0000-00000000aaaa', 'rls_locA',
   'Tenant A Private Title', 'A Contact', 'a-private@test.invalid', '5550001111', 'title_company'),
  ('7c000000-0000-0000-0000-00000000b001', 'bbbb2222-0000-0000-0000-00000000bbbb', 'rls_locB',
   'Tenant B Private Title', 'B Contact', 'b-private@test.invalid', '5550002222', 'title_company'),
  ('7c000000-0000-0000-0000-00000000b002', 'bbbb2222-0000-0000-0000-00000000bbbb', 'rls_locB',
   'Shared Title Co', 'B Shared Contact', 'b-shared@test.invalid', '5550003333', 'title_company');
INSERT INTO public.archive_title_companies (id, name, contact_name, email, phone, entity_type, is_active)
VALUES ('7c000000-0000-0000-0000-0000000ac001', 'Shared Title Co', 'Curated Contact',
        'curated@test.invalid', '5550003333', 'title_company', true);

-- ---- an admin, to prove the lockdown does not lock admins out -------------
INSERT INTO auth.users (id, email) VALUES
  ('dddd4444-0000-0000-0000-00000000dddd', 'rls-admin@test.invalid');
INSERT INTO public.profiles (user_id, email, name) VALUES
  ('dddd4444-0000-0000-0000-00000000dddd', 'rls-admin@test.invalid', 'Admin');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('dddd4444-0000-0000-0000-00000000dddd', 'admin');

-- ---- curated contact catalogs (now admin-only) ----------------------------
INSERT INTO public.archive_realtors (name, email, phone, is_active)
VALUES ('Archive Realtor', 'realtor@test.invalid', '5554443333', true);
INSERT INTO public.archive_notaries (name, email, phone, is_active)
VALUES ('Archive Notary', 'notary@test.invalid', '5554442222', true);

-- ---- audit / log tables ---------------------------------------------------
INSERT INTO public.merge_audit_log (phase, summary)
VALUES (1, '{"k":"v"}'::jsonb);
INSERT INTO public.oauth_install_log (location_id, source, payload)
VALUES ('rls_locA', 'test', '{"access_token":"AT","refresh_token":"RT","companyId":"c1"}'::jsonb);

-- ---- deal children + archive reveal ledger --------------------------------
INSERT INTO public.team_members (id, user_id, ghl_location_id, name)
VALUES ('7e000000-0000-0000-0000-00000000a001', 'aaaa1111-0000-0000-0000-00000000aaaa', 'rls_locA', 'Roster A');
INSERT INTO public.deal_activity (deal_id, event_type)
SELECT id, 'seeded' FROM public.deals WHERE ghl_location_id = 'rls_locA' LIMIT 1;
INSERT INTO public.deal_assignees (deal_id, team_member_id, role)
SELECT id, '7e000000-0000-0000-0000-00000000a001', 'owner'
  FROM public.deals WHERE ghl_location_id = 'rls_locA' LIMIT 1;
INSERT INTO public.archive_buyers (id, full_name, email)
VALUES ('7a000000-0000-0000-0000-00000000a001', 'Archive Buyer', 'ab@test.invalid');
INSERT INTO public.archive_buyer_reveals (ghl_location_id, buyer_id)
VALUES ('rls_locA', '7a000000-0000-0000-0000-00000000a001');

SET session_replication_role = origin;

-- ---- probes --------------------------------------------------------------
-- Each block runs as `authenticated` with a specific identity + header, and
-- records what that persona could reach.
DO $$
DECLARE tbl text; n bigint;
BEGIN
  -- OUTSIDER forging the victim's location header: must see nothing.
  PERFORM set_config('request.jwt.claim.sub','cccc3333-0000-0000-0000-00000000cccc', true);
  PERFORM set_config('request.headers','{"x-ghl-location-id":"rls_locA"}', true);
  SET LOCAL ROLE authenticated;
  FOREACH tbl IN ARRAY ARRAY['buyers','deals','tasks','jv_partners','kpi_snapshots',
                             'realtors','notaries','deal_offers','credit_balances',
                             'credit_transactions','subscriptions','archive_buyer_reveals',
                             'ghl_dispo_stage_mappings','ghl_location_tokens',
                             'skiptrace_buyers','skiptrace_buyer_phones','skiptrace_upload_batches',
                             'archive_realtors','archive_notaries','merge_audit_log',
                             'oauth_install_log']
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I', tbl) INTO n;
    INSERT INTO _t VALUES ('outsider.read.'||tbl, n::text, '0');
  END LOOP;
  RESET ROLE;
END $$;

-- Outsider write attempts must all fail or affect zero rows.
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','cccc3333-0000-0000-0000-00000000cccc', true);
  PERFORM set_config('request.headers','{"x-ghl-location-id":"rls_locA"}', true);
  SET LOCAL ROLE authenticated;

  BEGIN
    WITH x AS (UPDATE public.deals SET property_address='PWNED'
                WHERE ghl_location_id='rls_locA' RETURNING 1)
    SELECT count(*) INTO n FROM x;
  EXCEPTION WHEN insufficient_privilege OR others THEN n := 0;
  END;
  INSERT INTO _t VALUES ('outsider.update.deals', n::text, '0');

  BEGIN
    WITH x AS (DELETE FROM public.deals WHERE ghl_location_id='rls_locA' RETURNING 1)
    SELECT count(*) INTO n FROM x;
  EXCEPTION WHEN others THEN n := 0;
  END;
  INSERT INTO _t VALUES ('outsider.delete.deals', n::text, '0');

  BEGIN
    INSERT INTO public.buyers (user_id, ghl_location_id, name)
    VALUES ('cccc3333-0000-0000-0000-00000000cccc','rls_locA','INJECTED');
    n := 1;
  EXCEPTION WHEN others THEN n := 0;
  END;
  INSERT INTO _t VALUES ('outsider.inject.buyer', n::text, '0');

  -- privilege escalation: self-granting membership/ownership of a claimed tenant
  BEGIN
    INSERT INTO public.ghl_location_links
      (user_id, linked_by_user_id, workspace_owner_user_id, ghl_location_id)
    VALUES ('cccc3333-0000-0000-0000-00000000cccc','cccc3333-0000-0000-0000-00000000cccc',
            'cccc3333-0000-0000-0000-00000000cccc','rls_locA');
    n := 1;
  EXCEPTION WHEN others THEN n := 0;
  END;
  INSERT INTO _t VALUES ('outsider.escalate.claim_owned_location', n::text, '0');

  RESET ROLE;
END $$;

-- Legitimate member must retain full access, including operator-group siblings
-- and webhook-created (user_id IS NULL) deals.
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaa1111-0000-0000-0000-00000000aaaa', true);
  PERFORM set_config('request.headers','{"x-ghl-location-id":"rls_locA"}', true);
  SET LOCAL ROLE authenticated;

  SELECT count(*) INTO n FROM public.buyers WHERE ghl_location_id='rls_locA';
  INSERT INTO _t VALUES ('member.read.own_buyers', n::text, '1');

  SELECT count(*) INTO n FROM public.deals WHERE user_id IS NULL AND ghl_location_id='rls_locA';
  INSERT INTO _t VALUES ('member.read.webhook_deal', n::text, '1');

  SELECT count(*) INTO n FROM public.credit_balances WHERE ghl_location_id='rls_locA';
  INSERT INTO _t VALUES ('member.read.credit_balance', n::text, '1');

  SELECT count(*) INTO n FROM public.buyers WHERE ghl_location_id='rls_locC';
  INSERT INTO _t VALUES ('member.read.operator_sibling', n::text, '1');

  WITH x AS (UPDATE public.deals SET property_address='edited'
              WHERE ghl_location_id='rls_locA' RETURNING 1)
  SELECT count(*) INTO n FROM x;
  INSERT INTO _t VALUES ('member.update.webhook_deal', n::text, '1');

  RESET ROLE;
END $$;

-- ===========================================================================
-- 20260807090000 / 20260807090100 -- definer RPCs, PII exposure, integrity
-- ===========================================================================

-- list_title_company_archive(): the cross-tenant leak. Tenant A must never see
-- tenant B's private rows, must still see the curated row, and community rows
-- must come back with contact fields stripped.
DO $$
DECLARE n bigint; v text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaa1111-0000-0000-0000-00000000aaaa', true);
  PERFORM set_config('request.headers','{}', true);
  SET LOCAL ROLE authenticated;

  -- By design (discovery is kept), tenant B's row is still listed -- but only as
  -- a masked 'community' entry. What must never cross tenants is the contact
  -- detail, so assert on the masking rather than on absence.
  SELECT count(*) INTO n FROM public.list_title_company_archive()
   WHERE id = '7c000000-0000-0000-0000-00000000b001'
     AND source = 'community'
     AND contact_name IS NULL AND email IS NULL AND phone IS NULL
     AND address IS NULL AND notes IS NULL;
  INSERT INTO _t VALUES ('titleco.tenantB_row_masked', n::text, '1');

  -- and specifically: B's private contact details must appear nowhere at all
  SELECT count(*) INTO n FROM public.list_title_company_archive()
   WHERE email = 'b-private@test.invalid' OR phone = '5550002222'
      OR contact_name = 'B Contact';
  INSERT INTO _t VALUES ('titleco.tenantB_contacts_never_returned', n::text, '0');

  SELECT count(*) INTO n FROM public.list_title_company_archive()
   WHERE name = 'Tenant A Private Title';               -- own row still visible
  INSERT INTO _t VALUES ('titleco.own_row_visible', n::text, '1');

  SELECT count(*) INTO n FROM public.list_title_company_archive()
   WHERE name = 'Shared Title Co' AND source = 'archive';
  INSERT INTO _t VALUES ('titleco.curated_row_visible', n::text, '1');

  -- "Used by N" must survive the scoping: 1 curated + 1 tenant-B row = 2
  SELECT usage_count::text INTO v FROM public.list_title_company_archive()
   WHERE name = 'Shared Title Co';
  INSERT INTO _t VALUES ('titleco.usage_count_preserved', coalesce(v,'<none>'), '2');

  -- no contact detail may leak through any row the caller does not own
  SELECT count(*) INTO n FROM public.list_title_company_archive()
   WHERE source = 'community'
     AND (contact_name IS NOT NULL OR email IS NOT NULL
          OR phone IS NOT NULL OR address IS NOT NULL OR notes IS NOT NULL);
  INSERT INTO _t VALUES ('titleco.community_contacts_masked', n::text, '0');

  RESET ROLE;
END $$;

-- Symmetry: tenant B must not see tenant A's private row either.
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','bbbb2222-0000-0000-0000-00000000bbbb', true);
  PERFORM set_config('request.headers','{}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.list_title_company_archive()
   WHERE email = 'a-private@test.invalid' OR phone = '5550001111'
      OR contact_name = 'A Contact';
  INSERT INTO _t VALUES ('titleco.symmetric_isolation', n::text, '0');
  RESET ROLE;
END $$;

-- Function ACLs. This is the assertion that catches the next DROP FUNCTION
-- that forgets to re-apply its grants -- exactly how the leak was introduced.
INSERT INTO _t
SELECT 'acl.anon_cannot_exec_title_archive',
       has_function_privilege('anon','public.list_title_company_archive()','EXECUTE')::text, 'false';
INSERT INTO _t
SELECT 'acl.authenticated_can_exec_title_archive',
       has_function_privilege('authenticated','public.list_title_company_archive()','EXECUTE')::text, 'true';
INSERT INTO _t
SELECT 'acl.anon_cannot_exec_distinct_sources',
       has_function_privilege('anon','public.archive_buyer_distinct_sources()','EXECUTE')::text, 'false';

-- archive_buyer_distinct_sources(): super_admin only, silently empty otherwise.
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaa1111-0000-0000-0000-00000000aaaa', true);
  PERFORM set_config('request.headers','{}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.archive_buyer_distinct_sources();
  INSERT INTO _t VALUES ('distinct_sources.non_admin_empty', n::text, '0');
  RESET ROLE;
END $$;

-- Log-table redaction. Runs after session_replication_role = origin, so the
-- BEFORE INSERT triggers actually fire (they are disabled under 'replica').
DO $$
DECLARE has_secret boolean; has_auth boolean; has_ua boolean;
BEGIN
  INSERT INTO public.oauth_install_log (location_id, source, payload)
  VALUES ('rls_locA', 'test', '{"access_token":"AT2","refresh_token":"RT2","companyId":"c9"}'::jsonb);
  SELECT payload ?| ARRAY['access_token','refresh_token'] INTO has_secret
    FROM public.oauth_install_log WHERE payload->>'companyId' = 'c9';
  INSERT INTO _t VALUES ('oauth_install_log.tokens_stripped_on_write', has_secret::text, 'false');

  INSERT INTO public.webhook_debug_log (function_name, headers, body)
  VALUES ('t', '{"authorization":"Bearer x","x-ghl-sso":"blob","user-agent":"UA"}'::jsonb, '{}'::jsonb);
  SELECT headers ?| ARRAY['authorization','x-ghl-sso'], headers ? 'user-agent'
    INTO has_auth, has_ua
    FROM public.webhook_debug_log WHERE function_name = 't';
  INSERT INTO _t VALUES ('webhook_debug_log.credentials_stripped', has_auth::text, 'false');
  INSERT INTO _t VALUES ('webhook_debug_log.useful_headers_kept', has_ua::text, 'true');
END $$;

-- Historical redaction. The 'c1' row was seeded under session_replication_role
-- = replica, so the BEFORE INSERT trigger never fired -- it stands in for a row
-- written before this migration existed. Re-run the migration's own one-time
-- UPDATE over it and assert the sweep actually strips such rows.
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

INSERT INTO _t
SELECT 'oauth_install_log.history_sweep_strips_tokens',
       (SELECT bool_or(payload ?| ARRAY['access_token','refresh_token'])
          FROM public.oauth_install_log WHERE payload->>'companyId' = 'c1')::text,
       'false';

-- profiles.email may not be moved by a client, but must follow auth.users.
DO $$
DECLARE v text;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','aaaa1111-0000-0000-0000-00000000aaaa', true);
  PERFORM set_config('request.headers','{}', true);
  SET LOCAL ROLE authenticated;
  UPDATE public.profiles SET email = 'stolen@test.invalid'
   WHERE user_id = 'aaaa1111-0000-0000-0000-00000000aaaa';
  RESET ROLE;
  SELECT email INTO v FROM public.profiles
   WHERE user_id = 'aaaa1111-0000-0000-0000-00000000aaaa';
  INSERT INTO _t VALUES ('profiles.email_pinned_from_client', v, 'rls-owner@test.invalid');

  UPDATE auth.users SET email = 'moved@test.invalid'
   WHERE id = 'aaaa1111-0000-0000-0000-00000000aaaa';
  SELECT email INTO v FROM public.profiles
   WHERE user_id = 'aaaa1111-0000-0000-0000-00000000aaaa';
  INSERT INTO _t VALUES ('profiles.email_follows_auth_users', v, 'moved@test.invalid');
END $$;

-- Foreign keys actually enforce and cascade.
DO $$
DECLARE n bigint; violated boolean := false;
BEGIN
  BEGIN
    INSERT INTO public.deal_activity (deal_id, event_type)
    VALUES ('00000000-0000-0000-0000-0000000000ff', 'orphan');
  EXCEPTION WHEN foreign_key_violation THEN violated := true;
  END;
  INSERT INTO _t VALUES ('fk.deal_activity_rejects_orphan', violated::text, 'true');

  DELETE FROM public.deals WHERE ghl_location_id = 'rls_locA';
  SELECT count(*) INTO n FROM public.deal_activity;
  INSERT INTO _t VALUES ('fk.deal_activity_cascaded', n::text, '0');
  SELECT count(*) INTO n FROM public.deal_assignees;
  INSERT INTO _t VALUES ('fk.deal_assignees_cascaded', n::text, '0');

  DELETE FROM public.archive_buyers WHERE id = '7a000000-0000-0000-0000-00000000a001';
  SELECT count(*) INTO n FROM public.archive_buyer_reveals;
  INSERT INTO _t VALUES ('fk.archive_buyer_reveals_cascaded', n::text, '0');
END $$;

-- The lockdown must not lock admins out: the Admin console still reads these.
DO $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('request.jwt.claim.sub','dddd4444-0000-0000-0000-00000000dddd', true);
  PERFORM set_config('request.headers','{}', true);
  SET LOCAL ROLE authenticated;
  SELECT count(*) INTO n FROM public.archive_realtors;
  INSERT INTO _t VALUES ('admin.can_read_archive_realtors', (n > 0)::text, 'true');
  SELECT count(*) INTO n FROM public.archive_notaries;
  INSERT INTO _t VALUES ('admin.can_read_archive_notaries', (n > 0)::text, 'true');
  SELECT count(*) INTO n FROM public.merge_audit_log;
  INSERT INTO _t VALUES ('admin.can_read_merge_audit_log', (n > 0)::text, 'true');
  SELECT count(*) INTO n FROM public.oauth_install_log;
  INSERT INTO _t VALUES ('admin.can_read_oauth_install_log', (n > 0)::text, 'true');
  RESET ROLE;
END $$;

-- buyer_archive is gone.
INSERT INTO _t
SELECT 'buyer_archive.dropped', (to_regclass('public.buyer_archive') IS NULL)::text, 'true';

-- ---- assert --------------------------------------------------------------
DO $$
DECLARE bad text;
BEGIN
  SELECT string_agg(format('%s: got %s, want %s', label, actual, expected), E'\n')
    INTO bad FROM _t WHERE actual IS DISTINCT FROM expected;
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION E'RLS tenant-isolation FAILED:\n%', bad;
  END IF;
  RAISE NOTICE 'RLS tenant-isolation: all % assertions passed', (SELECT count(*) FROM _t);
END $$;

ROLLBACK;
