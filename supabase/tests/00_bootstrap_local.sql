-- ============================================================================
-- TEST-ONLY bootstrap. NOT a migration -- do not move this into
-- supabase/migrations/.
--
-- A bare `supabase/postgres` container ships the extensions but not the
-- GoTrue-managed objects (auth schema, auth.users, the anon/authenticated/
-- service_role roles) nor the Storage schema, and no migration in this repo
-- creates them. Replaying supabase/migrations/ against a raw container fails
-- without this prelude.
--
-- Usage -- NOTE the bootstrap runs as `supabase_admin`, not `postgres`:
-- on the supabase image `auth` and `storage` are owned by supabase_admin and
-- `postgres` is NOT a superuser, so extending those schemas as postgres fails
-- with "permission denied for schema auth". The migrations themselves run as
-- postgres, which this file grants onward.
--
--   docker run -d --name bdh-mig-test -p 55432:5432 -e POSTGRES_PASSWORD=postgres \
--     public.ecr.aws/supabase/postgres:17.6.1.104
--   psql -h 127.0.0.1 -p 55432 -U supabase_admin -v ON_ERROR_STOP=1 -f supabase/tests/00_bootstrap_local.sql
--   for f in supabase/migrations/*.sql; do psql ... -U postgres -v ON_ERROR_STOP=1 -f "$f" || exit 1; done
--   psql ... -U postgres -v ON_ERROR_STOP=1 -f supabase/tests/rls_tenant_isolation.sql
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Roles. The supabase/postgres image already defines these; guard anyway so
-- this file also works on a stock postgres image.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN NOINHERIT BYPASSRLS;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- auth schema: minimal stand-in for GoTrue.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              text,
  raw_user_meta_data jsonb DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- PostgREST sets these GUCs per request; auth.uid() reads them back.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.role', true), '');
$$;

-- `postgres` runs the migrations and several of them create triggers on
-- auth.users, so it needs more than USAGE here.
GRANT ALL   ON SCHEMA auth TO postgres;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT ALL   ON auth.users TO postgres, service_role;
GRANT EXECUTE ON FUNCTION auth.uid()  TO postgres, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.role() TO postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- storage schema: three migrations create bucket rows and policies on
-- storage.objects and abort without these.
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS storage;

CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL,
  public boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[],
  owner uuid,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text REFERENCES storage.buckets(id),
  name text,
  owner uuid,
  path_tokens text[],
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION storage.foldername(name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $$ SELECT string_to_array(name, '/') $$;

GRANT ALL   ON SCHEMA storage TO postgres;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO postgres, service_role;
GRANT EXECUTE ON FUNCTION storage.foldername(text) TO postgres, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public schema privileges.
--
-- This mirrors Supabase's default grants, and it is load-bearing for the tests:
-- `authenticated` holding TABLE-level UPDATE on public.profiles is precisely
-- why a column-level `REVOKE UPDATE (email)` would be a no-op, and why
-- profiles_pin_email() is implemented as a trigger instead.
-- ---------------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;
