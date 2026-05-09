
-- Belt-and-suspenders: when current_ghl_location() is set (iframe mode),
-- rows must have a matching, non-null ghl_location_id. Standalone mode
-- (current_ghl_location() IS NULL) still sees everything for the owner.

-- DEALS
DROP POLICY IF EXISTS "Deals: scoped select" ON public.deals;
CREATE POLICY "Deals: scoped select" ON public.deals FOR SELECT TO authenticated
USING (
  ((auth.uid() = user_id) OR is_admin(auth.uid()))
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);
DROP POLICY IF EXISTS "Deals: scoped insert" ON public.deals;
CREATE POLICY "Deals: scoped insert" ON public.deals FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id)
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);
DROP POLICY IF EXISTS "Deals: scoped update" ON public.deals;
CREATE POLICY "Deals: scoped update" ON public.deals FOR UPDATE TO authenticated
USING (
  (auth.uid() = user_id)
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);
DROP POLICY IF EXISTS "Deals: scoped delete" ON public.deals;
CREATE POLICY "Deals: scoped delete" ON public.deals FOR DELETE TO authenticated
USING (
  (auth.uid() = user_id)
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
);

-- TASKS
DROP POLICY IF EXISTS "Tasks: scoped select" ON public.tasks;
CREATE POLICY "Tasks: scoped select" ON public.tasks FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Tasks: scoped insert" ON public.tasks;
CREATE POLICY "Tasks: scoped insert" ON public.tasks FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Tasks: scoped update" ON public.tasks;
CREATE POLICY "Tasks: scoped update" ON public.tasks FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Tasks: scoped delete" ON public.tasks;
CREATE POLICY "Tasks: scoped delete" ON public.tasks FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- BUYERS
DROP POLICY IF EXISTS "Buyers: scoped select" ON public.buyers;
CREATE POLICY "Buyers: scoped select" ON public.buyers FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Buyers: scoped insert" ON public.buyers;
CREATE POLICY "Buyers: scoped insert" ON public.buyers FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Buyers: scoped update" ON public.buyers;
CREATE POLICY "Buyers: scoped update" ON public.buyers FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Buyers: scoped delete" ON public.buyers;
CREATE POLICY "Buyers: scoped delete" ON public.buyers FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- BUYER ARCHIVE
DROP POLICY IF EXISTS "Archive: scoped read" ON public.buyer_archive;
CREATE POLICY "Archive: scoped read" ON public.buyer_archive FOR SELECT TO authenticated
USING (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()));
DROP POLICY IF EXISTS "Archive: scoped insert" ON public.buyer_archive;
CREATE POLICY "Archive: scoped insert" ON public.buyer_archive FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = added_by_user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- TEAM MEMBERS
DROP POLICY IF EXISTS "Team: scoped select" ON public.team_members;
CREATE POLICY "Team: scoped select" ON public.team_members FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Team: scoped insert" ON public.team_members;
CREATE POLICY "Team: scoped insert" ON public.team_members FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Team: scoped update" ON public.team_members;
CREATE POLICY "Team: scoped update" ON public.team_members FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Team: scoped delete" ON public.team_members;
CREATE POLICY "Team: scoped delete" ON public.team_members FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- TITLE COMPANIES
DROP POLICY IF EXISTS "TitleCo: scoped select" ON public.title_companies;
CREATE POLICY "TitleCo: scoped select" ON public.title_companies FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "TitleCo: scoped insert" ON public.title_companies;
CREATE POLICY "TitleCo: scoped insert" ON public.title_companies FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "TitleCo: scoped update" ON public.title_companies;
CREATE POLICY "TitleCo: scoped update" ON public.title_companies FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "TitleCo: scoped delete" ON public.title_companies;
CREATE POLICY "TitleCo: scoped delete" ON public.title_companies FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- JV PARTNERS
DROP POLICY IF EXISTS "JV: scoped select" ON public.jv_partners;
CREATE POLICY "JV: scoped select" ON public.jv_partners FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "JV: scoped insert" ON public.jv_partners;
CREATE POLICY "JV: scoped insert" ON public.jv_partners FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "JV: scoped update" ON public.jv_partners;
CREATE POLICY "JV: scoped update" ON public.jv_partners FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "JV: scoped delete" ON public.jv_partners;
CREATE POLICY "JV: scoped delete" ON public.jv_partners FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- KPI SNAPSHOTS
DROP POLICY IF EXISTS "KPI: scoped select" ON public.kpi_snapshots;
CREATE POLICY "KPI: scoped select" ON public.kpi_snapshots FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "KPI: scoped insert" ON public.kpi_snapshots;
CREATE POLICY "KPI: scoped insert" ON public.kpi_snapshots FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "KPI: scoped update" ON public.kpi_snapshots;
CREATE POLICY "KPI: scoped update" ON public.kpi_snapshots FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "KPI: scoped delete" ON public.kpi_snapshots;
CREATE POLICY "KPI: scoped delete" ON public.kpi_snapshots FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "Notifications: scoped select" ON public.notifications;
CREATE POLICY "Notifications: scoped select" ON public.notifications FOR SELECT TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Notifications: scoped insert" ON public.notifications;
CREATE POLICY "Notifications: scoped insert" ON public.notifications FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Notifications: scoped update" ON public.notifications;
CREATE POLICY "Notifications: scoped update" ON public.notifications FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "Notifications: scoped delete" ON public.notifications;
CREATE POLICY "Notifications: scoped delete" ON public.notifications FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));

-- DEAL FILES
DROP POLICY IF EXISTS "DealFiles: scoped select" ON public.deal_files;
CREATE POLICY "DealFiles: scoped select" ON public.deal_files FOR SELECT TO authenticated
USING (((auth.uid() = user_id) OR is_admin(auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "DealFiles: scoped insert" ON public.deal_files;
CREATE POLICY "DealFiles: scoped insert" ON public.deal_files FOR INSERT TO authenticated
WITH CHECK ((auth.uid() = user_id) AND (EXISTS (SELECT 1 FROM deals d WHERE d.id = deal_files.deal_id AND d.user_id = auth.uid())) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "DealFiles: scoped update" ON public.deal_files;
CREATE POLICY "DealFiles: scoped update" ON public.deal_files FOR UPDATE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
DROP POLICY IF EXISTS "DealFiles: scoped delete" ON public.deal_files;
CREATE POLICY "DealFiles: scoped delete" ON public.deal_files FOR DELETE TO authenticated
USING ((auth.uid() = user_id) AND (current_ghl_location() IS NULL OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())));
