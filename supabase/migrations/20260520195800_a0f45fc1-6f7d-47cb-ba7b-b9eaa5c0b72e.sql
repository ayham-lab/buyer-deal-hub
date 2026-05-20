DROP POLICY IF EXISTS "Deals: scoped update" ON public.deals;

CREATE POLICY "Deals: scoped update" ON public.deals
FOR UPDATE TO authenticated
USING (
  (
    auth.uid() = user_id
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL)
    OR (ghl_location_id IS NOT NULL AND public.is_location_member(auth.uid(), ghl_location_id))
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
)
WITH CHECK (
  (
    auth.uid() = user_id
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL)
    OR (ghl_location_id IS NOT NULL AND public.is_location_member(auth.uid(), ghl_location_id))
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);