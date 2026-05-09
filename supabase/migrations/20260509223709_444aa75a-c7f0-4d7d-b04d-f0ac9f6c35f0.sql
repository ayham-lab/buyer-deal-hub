DROP POLICY IF EXISTS "Profiles: own update" ON public.profiles;
CREATE POLICY "Profiles: scoped own update"
ON public.profiles
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  OR (
    public.is_admin(auth.uid())
    AND public.current_ghl_location() IS NULL
  )
);

DROP POLICY IF EXISTS "Roles: admin manage" ON public.user_roles;
CREATE POLICY "Roles: standalone admin manage"
ON public.user_roles
FOR ALL
TO authenticated
USING (
  public.is_admin(auth.uid())
  AND public.current_ghl_location() IS NULL
)
WITH CHECK (
  public.is_admin(auth.uid())
  AND public.current_ghl_location() IS NULL
);

DROP POLICY IF EXISTS "GHLLinks: self insert" ON public.ghl_location_links;
CREATE POLICY "GHLLinks: scoped self insert"
ON public.ghl_location_links
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND linked_by_user_id = auth.uid()
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);