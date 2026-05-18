
-- Helper: returns the operator_account_id for a given location id, or null.
CREATE OR REPLACE FUNCTION public.operator_id_for_location(p_location text)
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT operator_account_id FROM public.ghl_location_tokens
   WHERE ghl_location_id = p_location LIMIT 1
$$;

-- Helper: true if target location is in the same operator group as the
-- currently active request location (from x-ghl-location-id header).
CREATE OR REPLACE FUNCTION public.location_in_active_group(p_target text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH active AS (SELECT public.current_ghl_location() AS loc),
       op AS (SELECT public.operator_id_for_location((SELECT loc FROM active)) AS op_id)
  SELECT
    CASE
      WHEN (SELECT loc FROM active) IS NULL THEN true                          -- standalone unchanged
      WHEN p_target IS NULL THEN false
      WHEN p_target = (SELECT loc FROM active) THEN true                       -- same location
      WHEN (SELECT op_id FROM op) IS NULL THEN false                           -- not grouped
      ELSE EXISTS (
        SELECT 1 FROM public.ghl_location_tokens t
         WHERE t.ghl_location_id = p_target
           AND t.operator_account_id = (SELECT op_id FROM op)
      )
    END;
$$;

-- Tables to broaden SELECT for operator-group siblings.
-- Strategy: add an additional permissive SELECT policy. Existing scoped
-- policies remain; permissive policies are OR'd together.

-- deals
CREATE POLICY "Deals: operator group select"
  ON public.deals FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- buyers
CREATE POLICY "Buyers: operator group select"
  ON public.buyers FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- tasks
CREATE POLICY "Tasks: operator group select"
  ON public.tasks FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- kpi_snapshots
CREATE POLICY "KPI: operator group select"
  ON public.kpi_snapshots FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- jv_partners
CREATE POLICY "JV: operator group select"
  ON public.jv_partners FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- deal_files
CREATE POLICY "DealFiles: operator group select"
  ON public.deal_files FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- notifications
CREATE POLICY "Notifications: operator group select"
  ON public.notifications FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
    AND user_id = auth.uid()
  );

-- buyer_archive
CREATE POLICY "Archive: operator group select"
  ON public.buyer_archive FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND ghl_location_id IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- credit_balances
CREATE POLICY "credit_balances: operator group read"
  ON public.credit_balances FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- credit_transactions
CREATE POLICY "credit_tx: operator group read"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- subscriptions
CREATE POLICY "subscriptions: operator group read"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- archive_buyer_reveals
CREATE POLICY "reveals: operator group read"
  ON public.archive_buyer_reveals FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NOT NULL
    AND public.location_in_active_group(ghl_location_id)
  );

-- ghl_location_tokens — owner can read all locations they own (needed for
-- Settings UI to render the group's location names).
CREATE POLICY "GHLTokens: owner read by membership"
  ON public.ghl_location_tokens FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.location_memberships m
      WHERE m.location_id = ghl_location_tokens.ghl_location_id
        AND m.user_id = auth.uid()
    )
  );
