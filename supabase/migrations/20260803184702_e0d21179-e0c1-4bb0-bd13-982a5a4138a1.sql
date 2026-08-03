ALTER TABLE public.ghl_location_tokens
  ADD COLUMN IF NOT EXISTS activated_at timestamptz,
  ADD COLUMN IF NOT EXISTS activated_by uuid;

WITH used AS (
  SELECT ghl_location_id AS loc FROM public.deals WHERE ghl_location_id IS NOT NULL
  UNION SELECT ghl_location_id FROM public.buyers WHERE ghl_location_id IS NOT NULL
  UNION SELECT ghl_location_id FROM public.tasks WHERE ghl_location_id IS NOT NULL
  UNION SELECT m.location_id FROM public.location_memberships m
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_roles r
      WHERE r.user_id = m.user_id AND r.role IN ('super_admin','admin')
    )
)
UPDATE public.ghl_location_tokens t
SET activated_at = COALESCE(t.activated_at, now())
WHERE EXISTS (SELECT 1 FROM used u WHERE u.loc = t.ghl_location_id);

CREATE OR REPLACE FUNCTION public.activate_location(_location_id text, _user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated int;
BEGIN
  UPDATE public.ghl_location_tokens
  SET activated_at = COALESCE(activated_at, now()),
      activated_by = COALESCE(activated_by, _user_id)
  WHERE ghl_location_id = _location_id;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN _updated > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_location(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_location(text, uuid) TO service_role;