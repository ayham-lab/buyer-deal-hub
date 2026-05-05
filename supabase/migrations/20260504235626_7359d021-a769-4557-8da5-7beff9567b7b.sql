-- ============ OAuth provider tables ============
CREATE TABLE public.oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text UNIQUE NOT NULL,
  client_secret_hash text NOT NULL,
  name text NOT NULL,
  redirect_uris text[] NOT NULL DEFAULT '{}',
  scopes text[] NOT NULL DEFAULT ARRAY['read','write'],
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oauth_clients ENABLE ROW LEVEL SECURITY;
-- No policies = only service_role can access

CREATE TABLE public.oauth_authorization_codes (
  code text PRIMARY KEY,
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  redirect_uri text NOT NULL,
  scope text NOT NULL DEFAULT 'read write',
  ghl_location_id text,
  expires_at timestamptz NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oauth_authorization_codes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_access_tokens (
  access_token text PRIMARY KEY,
  refresh_token text UNIQUE NOT NULL,
  client_id text NOT NULL,
  user_id uuid NOT NULL,
  scope text NOT NULL DEFAULT 'read write',
  ghl_location_id text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.oauth_access_tokens ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_oauth_tokens_user ON public.oauth_access_tokens(user_id);
CREATE INDEX idx_oauth_tokens_refresh ON public.oauth_access_tokens(refresh_token);

-- ============ GHL Location Links ============
CREATE TABLE public.ghl_location_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_owner_user_id uuid NOT NULL,
  ghl_location_id text UNIQUE NOT NULL,
  ghl_location_name text,
  linked_by_user_id uuid NOT NULL,
  linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ghl_location_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "GHLLinks: owner select" ON public.ghl_location_links
FOR SELECT TO authenticated
USING (workspace_owner_user_id = auth.uid() OR linked_by_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "GHLLinks: owner delete" ON public.ghl_location_links
FOR DELETE TO authenticated
USING (workspace_owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE INDEX idx_ghl_links_owner ON public.ghl_location_links(workspace_owner_user_id);

-- ============ Profile notification prefs ============
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"email": true, "in_app": true}'::jsonb;

-- ============ Seed GHL OAuth client ============
DO $$
DECLARE
  v_client_id text := 'ghl_' || replace(gen_random_uuid()::text, '-', '');
  v_secret text := encode(gen_random_bytes(36), 'base64');
  v_hash text;
BEGIN
  v_secret := replace(replace(replace(v_secret, '+', ''), '/', ''), '=', '');
  v_hash := encode(digest(v_secret, 'sha256'), 'hex');
  INSERT INTO public.oauth_clients(client_id, client_secret_hash, name, redirect_uris, scopes)
  VALUES (
    v_client_id,
    v_hash,
    'GoHighLevel Marketplace',
    ARRAY['https://services.leadconnectorhq.com/oauth/clients/69f77f9835a39321831cf44a/authentication/oauth2/callback'],
    ARRAY['read','write']
  );
  RAISE NOTICE '======================================================================';
  RAISE NOTICE 'GHL OAuth Client created. SAVE THE SECRET NOW — it will not be shown again.';
  RAISE NOTICE 'CLIENT_ID:     %', v_client_id;
  RAISE NOTICE 'CLIENT_SECRET: %', v_secret;
  RAISE NOTICE '======================================================================';
END $$;

-- Make digest available (pgcrypto usually already enabled; ensure it)
CREATE EXTENSION IF NOT EXISTS pgcrypto;