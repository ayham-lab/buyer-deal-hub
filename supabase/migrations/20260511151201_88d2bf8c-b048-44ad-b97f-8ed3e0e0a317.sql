
-- Restore Pipeline Mapping access for iframe tenant members.
-- Previous policies required workspace_owner_user_id = auth.uid(), which
-- locked out GHL SSO users in the iframe. Replace with location-scoped
-- policies: in iframe, anyone in the matching tenant can read/write the
-- mapping for their own location; standalone owners/admins keep full access.

-- ghl_dispo_stage_mappings
DROP POLICY IF EXISTS "DispoMap: scoped owner select" ON public.ghl_dispo_stage_mappings;
DROP POLICY IF EXISTS "DispoMap: scoped owner delete" ON public.ghl_dispo_stage_mappings;
DROP POLICY IF EXISTS "DispoMap: owner insert" ON public.ghl_dispo_stage_mappings;

CREATE POLICY "DispoMap: location scoped select"
ON public.ghl_dispo_stage_mappings
FOR SELECT TO authenticated
USING (
  (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
  OR (current_ghl_location() IS NULL AND (workspace_owner_user_id = auth.uid() OR is_admin(auth.uid())))
);

CREATE POLICY "DispoMap: location scoped insert"
ON public.ghl_dispo_stage_mappings
FOR INSERT TO authenticated
WITH CHECK (
  (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
  OR (current_ghl_location() IS NULL AND workspace_owner_user_id = auth.uid())
);

CREATE POLICY "DispoMap: location scoped delete"
ON public.ghl_dispo_stage_mappings
FOR DELETE TO authenticated
USING (
  (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
  OR (current_ghl_location() IS NULL AND (workspace_owner_user_id = auth.uid() OR is_admin(auth.uid())))
);

-- ghl_location_links: allow location-scoped read for any tenant member in iframe
DROP POLICY IF EXISTS "GHLLinks: scoped owner select" ON public.ghl_location_links;
DROP POLICY IF EXISTS "GHLLinks: scoped member select" ON public.ghl_location_links;

CREATE POLICY "GHLLinks: location scoped select"
ON public.ghl_location_links
FOR SELECT TO authenticated
USING (
  (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
  OR (current_ghl_location() IS NULL AND (
        workspace_owner_user_id = auth.uid()
     OR linked_by_user_id = auth.uid()
     OR user_id = auth.uid()
     OR is_admin(auth.uid())
  ))
);
