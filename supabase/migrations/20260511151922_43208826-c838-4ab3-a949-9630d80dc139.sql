-- Relax ghl_location_tokens SELECT: iframe users see only their own location's row.
DROP POLICY IF EXISTS "GHLTokens: standalone admin read" ON public.ghl_location_tokens;

CREATE POLICY "GHLTokens: scoped read"
ON public.ghl_location_tokens
AS PERMISSIVE FOR SELECT
TO authenticated
USING (
  -- Standalone admin: full read
  (current_ghl_location() IS NULL AND public.is_admin(auth.uid()))
  OR
  -- Iframe tenant: only own location's token row, never any other tenant's
  (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
);