DROP POLICY IF EXISTS "Profiles: own select" ON public.profiles;

CREATE POLICY "Profiles: own select"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (
      is_admin(auth.uid())
      AND (
        current_ghl_location() IS NULL
        OR EXISTS (
          SELECT 1 FROM public.ghl_location_links l
          WHERE l.user_id = profiles.user_id
            AND l.ghl_location_id = current_ghl_location()
        )
      )
    )
  );

DROP POLICY IF EXISTS "Roles: own select" ON public.user_roles;

CREATE POLICY "Roles: own select"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (
    (auth.uid() = user_id)
    OR (
      is_admin(auth.uid())
      AND (
        current_ghl_location() IS NULL
        OR EXISTS (
          SELECT 1 FROM public.ghl_location_links l
          WHERE l.user_id = user_roles.user_id
            AND l.ghl_location_id = current_ghl_location()
        )
      )
    )
  );