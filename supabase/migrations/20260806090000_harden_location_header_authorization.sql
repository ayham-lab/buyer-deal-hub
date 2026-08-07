-- ============================================================================
-- Harden tenant scoping: the x-ghl-location-id header may NARROW access,
-- never GRANT it.
--
-- BACKGROUND
--   public.current_ghl_location() reads the client-supplied `x-ghl-location-id`
--   request header. A number of policies used that value as the *only* grant
--   condition, so any authenticated user could set the header to another
--   tenant's GHL location id and read (and in several cases write) that
--   tenant's rows. GHL location ids are not secret -- they appear in GHL URLs.
--
--   Separately, "GHLLinks: scoped self insert" allowed a client to insert an
--   arbitrary ghl_location_links row, and the AFTER INSERT trigger
--   sync_membership_from_ghl_link() then minted a location_memberships row --
--   with is_owner = true when workspace_owner_user_id was set to self. That is
--   a full takeover of an established tenant, and it would also defeat the
--   membership checks added below, so it is closed here too.
--
-- APPROACH
--   Every place the header is used as a grant now additionally requires the
--   caller to actually belong to that location, via caller_may_use_location().
--
-- DELIBERATELY UNCHANGED
--   * Standalone mode (no header): every policy keeps its existing
--     `current_ghl_location() IS NULL` branch untouched.
--   * admin / super_admin: accepted everywhere membership is accepted, so the
--     Admin console and support access behave exactly as before.
--   * Operator groups: membership is checked against the ACTIVE location only;
--     sibling locations in the same operator_account stay visible.
--   * Webhook-created deals (user_id IS NULL) remain visible and editable to
--     members of the owning location.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Helper: may the caller act in this location?
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.caller_may_use_location(p_location text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_location IS NOT NULL
     AND (
       public.is_location_member(auth.uid(), p_location)
       OR public.is_admin(auth.uid())
       OR public.is_super_admin(auth.uid())
     );
$$;

COMMENT ON FUNCTION public.caller_may_use_location(text) IS
  'True when the current user is a member of p_location (or an admin). Use this '
  'wherever current_ghl_location() would otherwise be the sole grant condition -- '
  'the header is client-supplied and must never widen access on its own.';

REVOKE ALL ON FUNCTION public.caller_may_use_location(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.caller_may_use_location(text) TO anon, authenticated, service_role;

-- Has this location already been claimed by anybody?
-- MUST be SECURITY DEFINER: location_memberships is itself under RLS, so an
-- inline EXISTS(...) in a policy is filtered to rows the *caller* can see. An
-- outsider sees none, making a plain NOT EXISTS() read as "unclaimed" for every
-- location -- which is exactly the escalation this is meant to stop.
CREATE OR REPLACE FUNCTION public.location_has_members(p_location text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.location_memberships WHERE location_id = p_location
  );
$$;

REVOKE ALL ON FUNCTION public.location_has_members(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.location_has_members(text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Operator groups: require membership of the ACTIVE location before
--    expanding to siblings. Fixes every "operator group" policy at once.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.location_in_active_group(p_target text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH active AS (SELECT public.current_ghl_location() AS loc),
       op AS (SELECT public.operator_id_for_location((SELECT loc FROM active)) AS op_id)
  SELECT
    CASE
      WHEN (SELECT loc FROM active) IS NULL THEN true                      -- standalone unchanged
      WHEN p_target IS NULL THEN false
      -- NEW: the header alone proves nothing. The caller must belong to the
      -- active location before we consult the operator group at all.
      WHEN NOT public.caller_may_use_location((SELECT loc FROM active)) THEN false
      WHEN p_target = (SELECT loc FROM active) THEN true                   -- same location
      WHEN (SELECT op_id FROM op) IS NULL THEN false                       -- not grouped
      ELSE EXISTS (
        SELECT 1 FROM public.ghl_location_tokens t
         WHERE t.ghl_location_id = p_target
           AND t.operator_account_id = (SELECT op_id FROM op)
      )
    END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Billing / ledger reads whose base policy was header-only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "credit_balances: scoped read" ON public.credit_balances;
CREATE POLICY "credit_balances: scoped read"
  ON public.credit_balances FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL
      AND ghl_location_id = current_ghl_location()
      AND public.caller_may_use_location(ghl_location_id))
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "credit_tx: scoped read" ON public.credit_transactions;
CREATE POLICY "credit_tx: scoped read"
  ON public.credit_transactions FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL
      AND ghl_location_id = current_ghl_location()
      AND public.caller_may_use_location(ghl_location_id))
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "subscriptions: scoped read" ON public.subscriptions;
CREATE POLICY "subscriptions: scoped read"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL
      AND ghl_location_id = current_ghl_location()
      AND public.caller_may_use_location(ghl_location_id))
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "reveals: scoped read" ON public.archive_buyer_reveals;
CREATE POLICY "reveals: scoped read"
  ON public.archive_buyer_reveals FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL
      AND ghl_location_id = current_ghl_location()
      AND public.caller_may_use_location(ghl_location_id))
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 3. buyer_archive: the base read was `header IS NULL OR header = row`, which
--    made the whole table world-readable to any authenticated user in
--    standalone mode. Only the Admin console reads this table.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Archive: scoped read" ON public.buyer_archive;
CREATE POLICY "Archive: scoped read"
  ON public.buyer_archive FOR SELECT TO authenticated
  USING (
    CASE
      WHEN current_ghl_location() IS NOT NULL THEN
        ghl_location_id IS NOT NULL
        AND ghl_location_id = current_ghl_location()
        AND public.caller_may_use_location(ghl_location_id)
      ELSE
        is_admin(auth.uid())
        OR is_super_admin(auth.uid())
        OR added_by_user_id = auth.uid()
        OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    END
  );

DROP POLICY IF EXISTS "Archive: scoped insert" ON public.buyer_archive;
CREATE POLICY "Archive: scoped insert"
  ON public.buyer_archive FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = added_by_user_id
    AND (current_ghl_location() IS NULL
         OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
    AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
  );

-- ---------------------------------------------------------------------------
-- 4. deal_offers: read AND write were both header-only.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Offers: scoped select" ON public.deal_offers;
CREATE POLICY "Offers: scoped select"
  ON public.deal_offers FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_offers.deal_id
        AND (
          (current_ghl_location() IS NULL AND (d.user_id = auth.uid() OR is_admin(auth.uid())))
          OR (current_ghl_location() IS NOT NULL
              AND d.ghl_location_id IS NOT NULL
              AND d.ghl_location_id = current_ghl_location()
              AND public.caller_may_use_location(d.ghl_location_id))
        )
    )
  );

DROP POLICY IF EXISTS "Offers: scoped insert" ON public.deal_offers;
CREATE POLICY "Offers: scoped insert"
  ON public.deal_offers FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_offers.deal_id
        AND (
          (current_ghl_location() IS NULL AND d.user_id = auth.uid())
          OR (current_ghl_location() IS NOT NULL
              AND d.ghl_location_id IS NOT NULL
              AND d.ghl_location_id = current_ghl_location()
              AND public.caller_may_use_location(d.ghl_location_id))
        )
    )
    AND (current_ghl_location() IS NULL OR ghl_location_id = current_ghl_location())
  );

DROP POLICY IF EXISTS "Offers: scoped update" ON public.deal_offers;
CREATE POLICY "Offers: scoped update"
  ON public.deal_offers FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_offers.deal_id
        AND (
          (current_ghl_location() IS NULL AND d.user_id = auth.uid())
          OR (current_ghl_location() IS NOT NULL
              AND d.ghl_location_id IS NOT NULL
              AND d.ghl_location_id = current_ghl_location()
              AND public.caller_may_use_location(d.ghl_location_id))
        )
    )
  );

DROP POLICY IF EXISTS "Offers: scoped delete" ON public.deal_offers;
CREATE POLICY "Offers: scoped delete"
  ON public.deal_offers FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.deals d
      WHERE d.id = deal_offers.deal_id
        AND (
          (current_ghl_location() IS NULL AND d.user_id = auth.uid())
          OR (current_ghl_location() IS NOT NULL
              AND d.ghl_location_id IS NOT NULL
              AND d.ghl_location_id = current_ghl_location()
              AND public.caller_may_use_location(d.ghl_location_id))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- 5. deals: the `user_id IS NULL` (webhook-created) branch was header-only for
--    SELECT, UPDATE and DELETE.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Deals: scoped select" ON public.deals;
CREATE POLICY "Deals: scoped select"
ON public.deals FOR SELECT TO authenticated
USING (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
        AND ghl_location_id = current_ghl_location()
        AND public.caller_may_use_location(ghl_location_id))
    OR is_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
  AND (
    deleted_at IS NULL
    OR auth.uid() = user_id
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR is_admin(auth.uid())
    OR is_super_admin(auth.uid())
  )
);

DROP POLICY IF EXISTS "Deals: scoped update" ON public.deals;
CREATE POLICY "Deals: scoped update"
ON public.deals FOR UPDATE TO authenticated
USING (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
        AND ghl_location_id = current_ghl_location()
        AND public.caller_may_use_location(ghl_location_id))
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR is_admin(auth.uid())
    OR is_super_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
)
WITH CHECK (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
        AND ghl_location_id = current_ghl_location()
        AND public.caller_may_use_location(ghl_location_id))
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR is_admin(auth.uid())
    OR is_super_admin(auth.uid())
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);

DROP POLICY IF EXISTS "Deals: scoped delete" ON public.deals;
CREATE POLICY "Deals: scoped delete"
ON public.deals FOR DELETE TO authenticated
USING (
  (
    (auth.uid() = user_id)
    OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
        AND ghl_location_id = current_ghl_location()
        AND public.caller_may_use_location(ghl_location_id))
  )
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);

DROP POLICY IF EXISTS "Deals: scoped insert" ON public.deals;
CREATE POLICY "Deals: scoped insert"
ON public.deals FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

-- ---------------------------------------------------------------------------
-- 6. Remaining `user_id IS NULL` header-only read branches.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "DealFiles: select" ON public.deal_files;
CREATE POLICY "DealFiles: select"
ON public.deal_files FOR SELECT
USING (
  auth.uid() = user_id
  OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
      AND ghl_location_id = current_ghl_location()
      AND public.caller_may_use_location(ghl_location_id))
  OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
  OR (ghl_location_id IS NOT NULL AND location_in_active_group(ghl_location_id))
  OR is_admin(auth.uid())
  OR is_super_admin(auth.uid())
);

DROP POLICY IF EXISTS "Realtors: scoped select" ON public.realtors;
CREATE POLICY "Realtors: scoped select" ON public.realtors FOR SELECT
  USING (
    ((auth.uid() = user_id) OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
     OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
     OR (ghl_location_id IS NOT NULL AND location_in_active_group(ghl_location_id))
     OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
         AND ghl_location_id = current_ghl_location()
         AND public.caller_may_use_location(ghl_location_id))
    )
    AND ((current_ghl_location() IS NULL)
         OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
         OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS "Notaries: scoped select" ON public.notaries;
CREATE POLICY "Notaries: scoped select" ON public.notaries FOR SELECT
  USING (
    ((auth.uid() = user_id) OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
     OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
     OR (ghl_location_id IS NOT NULL AND location_in_active_group(ghl_location_id))
     OR (user_id IS NULL AND current_ghl_location() IS NOT NULL
         AND ghl_location_id = current_ghl_location()
         AND public.caller_may_use_location(ghl_location_id))
    )
    AND ((current_ghl_location() IS NULL)
         OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
         OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- 7. Insert-side tenant injection: a forged header let a user stamp their own
--    rows with another tenant's location id, planting records in that tenant's
--    workspace. The row's location must be one the caller belongs to.
--    (`ghl_location_id IS NULL` is the standalone case and stays allowed.)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Buyers: scoped insert" ON public.buyers;
CREATE POLICY "Buyers: scoped insert" ON public.buyers FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "Tasks: scoped insert" ON public.tasks;
CREATE POLICY "Tasks: scoped insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "JV: scoped insert" ON public.jv_partners;
CREATE POLICY "JV: scoped insert" ON public.jv_partners FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "KPI: scoped insert" ON public.kpi_snapshots;
CREATE POLICY "KPI: scoped insert" ON public.kpi_snapshots FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "Notifications: scoped insert" ON public.notifications;
CREATE POLICY "Notifications: scoped insert" ON public.notifications FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "TitleCo: scoped insert" ON public.title_companies;
CREATE POLICY "TitleCo: scoped insert" ON public.title_companies FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "Team: scoped insert" ON public.team_members;
CREATE POLICY "Team: scoped insert" ON public.team_members FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (current_ghl_location() IS NULL
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "Realtors: scoped insert" ON public.realtors;
CREATE POLICY "Realtors: scoped insert" ON public.realtors FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND ((current_ghl_location() IS NULL)
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

DROP POLICY IF EXISTS "Notaries: scoped insert" ON public.notaries;
CREATE POLICY "Notaries: scoped insert" ON public.notaries FOR INSERT
WITH CHECK (
  auth.uid() = user_id
  AND ((current_ghl_location() IS NULL)
       OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  AND (ghl_location_id IS NULL OR public.caller_may_use_location(ghl_location_id))
);

-- ---------------------------------------------------------------------------
-- 8. ghl_dispo_stage_mappings: these rows decide which GHL opportunities are
--    ingested at all. Writes were header-only, so a forged header could stop a
--    competitor's deals from syncing.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "DispoMap: location scoped insert" ON public.ghl_dispo_stage_mappings;
CREATE POLICY "DispoMap: location scoped insert"
ON public.ghl_dispo_stage_mappings FOR INSERT TO authenticated
WITH CHECK (
  (current_ghl_location() IS NOT NULL
    AND ghl_location_id = current_ghl_location()
    AND public.caller_may_use_location(ghl_location_id))
  OR (current_ghl_location() IS NULL AND workspace_owner_user_id = auth.uid())
);

DROP POLICY IF EXISTS "DispoMap: location scoped delete" ON public.ghl_dispo_stage_mappings;
CREATE POLICY "DispoMap: location scoped delete"
ON public.ghl_dispo_stage_mappings FOR DELETE TO authenticated
USING (
  (current_ghl_location() IS NOT NULL
    AND ghl_location_id = current_ghl_location()
    AND public.caller_may_use_location(ghl_location_id))
  OR (current_ghl_location() IS NULL
      AND (workspace_owner_user_id = auth.uid() OR is_admin(auth.uid())))
);

DROP POLICY IF EXISTS "DispoMap: location scoped select" ON public.ghl_dispo_stage_mappings;
CREATE POLICY "DispoMap: location scoped select"
ON public.ghl_dispo_stage_mappings FOR SELECT TO authenticated
USING (
  (current_ghl_location() IS NOT NULL
    AND ghl_location_id = current_ghl_location()
    AND public.caller_may_use_location(ghl_location_id))
  OR (current_ghl_location() IS NULL
      AND (workspace_owner_user_id = auth.uid() OR is_admin(auth.uid())))
);

-- ---------------------------------------------------------------------------
-- 8b. ghl_location_tokens: the header-only branch let an outsider enumerate a
--     location's row (name, company, operator group, god_mode). The token
--     columns themselves are separately REVOKEd from anon/authenticated.
--     The operator-group branch is kept so the workspace switcher and location
--     badges can still resolve sibling names for a legitimate group member.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "GHLTokens: scoped read" ON public.ghl_location_tokens;
CREATE POLICY "GHLTokens: scoped read"
ON public.ghl_location_tokens FOR SELECT TO authenticated
USING (
  (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  OR (current_ghl_location() IS NOT NULL
      AND ghl_location_id = current_ghl_location()
      AND public.caller_may_use_location(ghl_location_id))
  OR (current_ghl_location() IS NOT NULL
      AND ghl_location_id IS NOT NULL
      AND public.location_in_active_group(ghl_location_id))
);

-- ---------------------------------------------------------------------------
-- 9. PRIVILEGE ESCALATION: client-side ghl_location_links inserts fed
--    sync_membership_from_ghl_link(), which minted a location_memberships row
--    (is_owner = true when workspace_owner_user_id = self). Any authenticated
--    user could therefore make themselves OWNER of an established tenant.
--
--    The documented onboarding rule is "first user to install a location
--    becomes its owner", so claiming a location that nobody has claimed yet is
--    still allowed. What is now blocked is claiming a location that already
--    has members. Existing members keep inserting freely (their upsert is a
--    no-op), and iframe-signin / oauth-marketplace-callback run as service_role
--    and bypass RLS entirely, so server-side onboarding is untouched.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "GHLLinks: scoped self insert" ON public.ghl_location_links;
CREATE POLICY "GHLLinks: scoped self insert"
ON public.ghl_location_links FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND linked_by_user_id = auth.uid()
  AND (public.current_ghl_location() IS NULL
       OR ghl_location_id = public.current_ghl_location())
  AND (
    public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.is_location_member(auth.uid(), ghl_location_id)
    -- unclaimed location: first installer may still claim it
    OR NOT public.location_has_members(ghl_location_id)
  )
);

-- ---------------------------------------------------------------------------
-- 10. Skiptrace tables: these carried `USING (true)` policies, so every
--     authenticated user of every tenant could read the full skiptrace dataset
--     (homeowner names, addresses, phones, emails) and UPDATE any phone's dial
--     status. The only consumer is the admin console
--     (src/components/admin/SkiptraceBuyersTab.tsx), which is gated on
--     `!isIframed && isAdmin`, so admin-only policies match actual usage.
--     Writes continue to run through edge functions on the service role, which
--     bypasses RLS entirely.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "skiptrace_buyers_read_authenticated" ON public.skiptrace_buyers;
CREATE POLICY "skiptrace_buyers_read_admin"
  ON public.skiptrace_buyers FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "skiptrace_phones_read_authenticated" ON public.skiptrace_buyer_phones;
CREATE POLICY "skiptrace_phones_read_admin"
  ON public.skiptrace_buyer_phones FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "skiptrace_phones_authenticated_update_status" ON public.skiptrace_buyer_phones;
CREATE POLICY "skiptrace_phones_admin_update_status"
  ON public.skiptrace_buyer_phones FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "skiptrace_batches_authenticated_read" ON public.skiptrace_upload_batches;
CREATE POLICY "skiptrace_batches_admin_read"
  ON public.skiptrace_upload_batches FOR SELECT TO authenticated
  USING (is_admin(auth.uid()) OR is_super_admin(auth.uid()));
