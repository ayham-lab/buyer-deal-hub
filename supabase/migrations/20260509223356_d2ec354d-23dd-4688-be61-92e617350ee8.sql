DROP POLICY IF EXISTS "GHLLinks: member select" ON public.ghl_location_links;
DROP POLICY IF EXISTS "GHLLinks: owner select" ON public.ghl_location_links;
DROP POLICY IF EXISTS "GHLLinks: member delete" ON public.ghl_location_links;
DROP POLICY IF EXISTS "GHLLinks: owner delete" ON public.ghl_location_links;
DROP POLICY IF EXISTS "GHLLinks: owner update" ON public.ghl_location_links;

CREATE POLICY "GHLLinks: scoped member select"
ON public.ghl_location_links
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);

CREATE POLICY "GHLLinks: scoped owner select"
ON public.ghl_location_links
FOR SELECT
TO authenticated
USING (
  (
    workspace_owner_user_id = auth.uid()
    OR linked_by_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);

CREATE POLICY "GHLLinks: scoped member delete"
ON public.ghl_location_links
FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);

CREATE POLICY "GHLLinks: scoped owner delete"
ON public.ghl_location_links
FOR DELETE
TO authenticated
USING (
  (
    workspace_owner_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);

CREATE POLICY "GHLLinks: scoped owner update"
ON public.ghl_location_links
FOR UPDATE
TO authenticated
USING (
  (
    workspace_owner_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
)
WITH CHECK (
  (
    workspace_owner_user_id = auth.uid()
    OR public.is_admin(auth.uid())
  )
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);

DROP POLICY IF EXISTS auth_read_tokens ON public.ghl_location_tokens;
CREATE POLICY "GHLTokens: scoped auth read"
ON public.ghl_location_tokens
FOR SELECT
TO authenticated
USING (
  public.current_ghl_location() IS NULL
  OR ghl_location_id = public.current_ghl_location()
);

DROP POLICY IF EXISTS "DispoMap: owner select" ON public.ghl_dispo_stage_mappings;
DROP POLICY IF EXISTS "DispoMap: owner delete" ON public.ghl_dispo_stage_mappings;
CREATE POLICY "DispoMap: scoped owner select"
ON public.ghl_dispo_stage_mappings
FOR SELECT
TO authenticated
USING (
  (workspace_owner_user_id = auth.uid() OR public.is_admin(auth.uid()))
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);
CREATE POLICY "DispoMap: scoped owner delete"
ON public.ghl_dispo_stage_mappings
FOR DELETE
TO authenticated
USING (
  (workspace_owner_user_id = auth.uid() OR public.is_admin(auth.uid()))
  AND (
    public.current_ghl_location() IS NULL
    OR ghl_location_id = public.current_ghl_location()
  )
);

DROP POLICY IF EXISTS "oauth_install_log: auth read" ON public.oauth_install_log;
CREATE POLICY "oauth_install_log: scoped auth read"
ON public.oauth_install_log
FOR SELECT
TO authenticated
USING (
  public.current_ghl_location() IS NULL
  OR location_id = public.current_ghl_location()
);

DROP POLICY IF EXISTS auth_read_webhook_debug ON public.webhook_debug_log;
CREATE POLICY "webhook_debug_log: standalone admin read"
ON public.webhook_debug_log
FOR SELECT
TO authenticated
USING (
  public.current_ghl_location() IS NULL
  AND public.is_admin(auth.uid())
);