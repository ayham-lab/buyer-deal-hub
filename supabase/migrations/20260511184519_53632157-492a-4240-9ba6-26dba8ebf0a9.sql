-- is_super_admin helper
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'super_admin'::public.app_role)
$$;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated, service_role;

-- archive_buyers: curated global buyer pool (no tenant scoping)
CREATE TABLE IF NOT EXISTS public.archive_buyers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  first_name text,
  last_name text,
  city text,
  state text,
  preferred_markets text[] NOT NULL DEFAULT '{}',
  price_min integer,
  price_max integer,
  property_types text[] NOT NULL DEFAULT '{}',
  buy_box jsonb NOT NULL DEFAULT '{}'::jsonb,
  phone text,
  email text,
  last_active_at timestamptz,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_buyers ENABLE ROW LEVEL SECURITY;

-- SELECT: any authenticated user (and anon for active rows so public marketing
-- pages stay possible). Real revelation gating happens via archive_buyer_reveals.
CREATE POLICY "archive_buyers: read for authenticated"
  ON public.archive_buyers FOR SELECT
  TO authenticated
  USING (true);

-- Mutations restricted to standalone super_admin
CREATE POLICY "archive_buyers: super_admin standalone insert"
  ON public.archive_buyers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()) AND public.current_ghl_location() IS NULL);

CREATE POLICY "archive_buyers: super_admin standalone update"
  ON public.archive_buyers FOR UPDATE
  TO authenticated
  USING (public.is_super_admin(auth.uid()) AND public.current_ghl_location() IS NULL)
  WITH CHECK (public.is_super_admin(auth.uid()) AND public.current_ghl_location() IS NULL);

CREATE POLICY "archive_buyers: super_admin standalone delete"
  ON public.archive_buyers FOR DELETE
  TO authenticated
  USING (public.is_super_admin(auth.uid()) AND public.current_ghl_location() IS NULL);

CREATE TRIGGER archive_buyers_updated_at
  BEFORE UPDATE ON public.archive_buyers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- reveal_archive_buyer RPC
CREATE OR REPLACE FUNCTION public.reveal_archive_buyer(p_location text, p_buyer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_already boolean;
  v_ok boolean;
BEGIN
  IF p_location IS NULL OR p_buyer_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'missing_params');
  END IF;

  -- If already revealed, return success idempotently
  SELECT EXISTS(
    SELECT 1 FROM public.archive_buyer_reveals
    WHERE ghl_location_id = p_location AND buyer_id = p_buyer_id
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('success', true, 'already_revealed', true);
  END IF;

  -- Charge credits
  v_ok := public.consume_credits(p_location, 'archive_reveal', p_buyer_id::text);
  IF NOT v_ok THEN
    RETURN jsonb_build_object('success', false, 'error', 'insufficient_credits');
  END IF;

  INSERT INTO public.archive_buyer_reveals (ghl_location_id, buyer_id)
    VALUES (p_location, p_buyer_id)
    ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object('success', true);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.reveal_archive_buyer(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reveal_archive_buyer(text, uuid) TO authenticated, service_role;
