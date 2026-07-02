
CREATE TABLE public.buyer_intake_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_location_id text NOT NULL UNIQUE,
  workspace_owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  label text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.buyer_intake_tokens TO authenticated;
GRANT ALL ON public.buyer_intake_tokens TO service_role;

ALTER TABLE public.buyer_intake_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intake_tokens_select" ON public.buyer_intake_tokens
  FOR SELECT TO authenticated
  USING (
    public.is_location_member(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "intake_tokens_insert" ON public.buyer_intake_tokens
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "intake_tokens_update" ON public.buyer_intake_tokens
  FOR UPDATE TO authenticated
  USING (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "intake_tokens_delete" ON public.buyer_intake_tokens
  FOR DELETE TO authenticated
  USING (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE TRIGGER trg_buyer_intake_tokens_updated
  BEFORE UPDATE ON public.buyer_intake_tokens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Public lookup by token for the intake page (returns only non-sensitive fields).
CREATE OR REPLACE FUNCTION public.get_buyer_intake_form_info(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'location_id', t.ghl_location_id,
    'workspace_name', COALESCE(p.name, p.email, 'Workspace'),
    'is_active', t.is_active
  )
  FROM public.buyer_intake_tokens t
  LEFT JOIN public.profiles p ON p.user_id = t.workspace_owner_user_id
  WHERE t.token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_buyer_intake_form_info(text) TO anon, authenticated;
