-- Lock down SECURITY DEFINER trigger functions (only triggers should call them)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.buyers_sync_to_archive() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_deal_changes() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_assignee_changes() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.log_file_changes() FROM anon, authenticated, public;
-- has_role and is_admin must be callable by authenticated for RLS policies
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon, public;

-- Create a temporary readable table for secret retrieval
CREATE TABLE IF NOT EXISTS public._oauth_bootstrap (
  id int PRIMARY KEY DEFAULT 1,
  client_id text,
  client_secret text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public._oauth_bootstrap ENABLE ROW LEVEL SECURITY;
-- No policies; service role only

DO $$
DECLARE
  v_secret text;
  v_hash text;
  v_cid text;
BEGIN
  v_secret := replace(replace(replace(encode(extensions.gen_random_bytes(36),'base64'),'+',''),'/',''),'=','');
  v_hash := encode(extensions.digest(v_secret, 'sha256'), 'hex');
  UPDATE public.oauth_clients
    SET client_secret_hash = v_hash
    WHERE name = 'GoHighLevel Marketplace'
    RETURNING client_id INTO v_cid;
  DELETE FROM public._oauth_bootstrap;
  INSERT INTO public._oauth_bootstrap(id, client_id, client_secret) VALUES (1, v_cid, v_secret);
END $$;