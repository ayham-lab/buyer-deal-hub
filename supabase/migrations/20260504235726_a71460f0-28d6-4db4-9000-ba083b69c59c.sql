-- Rotate GHL secret and print
DO $$
DECLARE
  v_secret text;
  v_hash text;
BEGIN
  v_secret := replace(replace(replace(encode(extensions.gen_random_bytes(36),'base64'),'+',''),'/',''),'=','');
  v_hash := encode(extensions.digest(v_secret, 'sha256'), 'hex');
  UPDATE public.oauth_clients
    SET client_secret_hash = v_hash
    WHERE name = 'GoHighLevel Marketplace';
  RAISE NOTICE '==================================================';
  RAISE NOTICE 'GHL CLIENT SECRET (copy now, stored as hash only):';
  RAISE NOTICE '%', v_secret;
  RAISE NOTICE '==================================================';
END $$;

-- Lock down SECURITY DEFINER functions: revoke from anon
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;

-- OAuth tables: explicit deny policies for clarity (no policies already = locked,
-- but linter wants explicit). These tables are only used by edge functions via service role.
CREATE POLICY "oauth_clients: deny all" ON public.oauth_clients
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "oauth_codes: deny all" ON public.oauth_authorization_codes
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "oauth_tokens: deny all" ON public.oauth_access_tokens
  FOR ALL TO authenticated, anon USING (false) WITH CHECK (false);