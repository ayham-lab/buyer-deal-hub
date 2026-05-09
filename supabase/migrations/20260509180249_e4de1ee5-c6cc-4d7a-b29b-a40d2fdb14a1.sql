
-- 1. Add ghl_location_id to every tenant data table
ALTER TABLE public.deals            ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.tasks            ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.buyers           ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.buyer_archive    ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.team_members     ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.title_companies  ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.jv_partners      ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.kpi_snapshots    ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.notifications    ADD COLUMN IF NOT EXISTS ghl_location_id text;
ALTER TABLE public.deal_files       ADD COLUMN IF NOT EXISTS ghl_location_id text;

CREATE INDEX IF NOT EXISTS idx_deals_ghl_location           ON public.deals(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ghl_location           ON public.tasks(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_buyers_ghl_location          ON public.buyers(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_buyer_archive_ghl_location   ON public.buyer_archive(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_team_members_ghl_location    ON public.team_members(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_title_companies_ghl_location ON public.title_companies(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_jv_partners_ghl_location     ON public.jv_partners(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_kpi_snapshots_ghl_location   ON public.kpi_snapshots(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_notifications_ghl_location   ON public.notifications(ghl_location_id);
CREATE INDEX IF NOT EXISTS idx_deal_files_ghl_location      ON public.deal_files(ghl_location_id);

-- 2. Helper: read the active GHL location from the x-ghl-location-id request header.
--    Returns NULL outside the iframe (standalone login = no scoping).
CREATE OR REPLACE FUNCTION public.current_ghl_location()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.headers', true)::json ->> 'x-ghl-location-id',
    ''
  )
$$;

-- ============================================================
-- 3. Replace tenant-table policies
--    Pattern:
--      SELECT/UPDATE/DELETE: owner (or admin) AND (header IS NULL OR row.location = header)
--      INSERT:               owner             AND (header IS NULL OR row.location = header)
-- ============================================================

-- ---- deals ----
DROP POLICY IF EXISTS "Deals: owner select" ON public.deals;
DROP POLICY IF EXISTS "Deals: owner insert" ON public.deals;
DROP POLICY IF EXISTS "Deals: owner update" ON public.deals;
DROP POLICY IF EXISTS "Deals: owner delete" ON public.deals;

CREATE POLICY "Deals: scoped select" ON public.deals FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Deals: scoped insert" ON public.deals FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Deals: scoped update" ON public.deals FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Deals: scoped delete" ON public.deals FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- tasks ----
DROP POLICY IF EXISTS "Tasks: owner all" ON public.tasks;

CREATE POLICY "Tasks: scoped select" ON public.tasks FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Tasks: scoped insert" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Tasks: scoped update" ON public.tasks FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Tasks: scoped delete" ON public.tasks FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- buyers ----
DROP POLICY IF EXISTS "Buyers: owner select" ON public.buyers;
DROP POLICY IF EXISTS "Buyers: owner insert" ON public.buyers;
DROP POLICY IF EXISTS "Buyers: owner update" ON public.buyers;
DROP POLICY IF EXISTS "Buyers: owner delete" ON public.buyers;

CREATE POLICY "Buyers: scoped select" ON public.buyers FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Buyers: scoped insert" ON public.buyers FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Buyers: scoped update" ON public.buyers FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Buyers: scoped delete" ON public.buyers FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- buyer_archive (shared rolodex; scope by header when present) ----
DROP POLICY IF EXISTS "Archive: all read"   ON public.buyer_archive;
DROP POLICY IF EXISTS "Archive: all insert" ON public.buyer_archive;
DROP POLICY IF EXISTS "Archive: admin update" ON public.buyer_archive;
DROP POLICY IF EXISTS "Archive: admin delete" ON public.buyer_archive;

CREATE POLICY "Archive: scoped read" ON public.buyer_archive FOR SELECT TO authenticated
  USING (
    public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location()
  );
CREATE POLICY "Archive: scoped insert" ON public.buyer_archive FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = added_by_user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Archive: admin update" ON public.buyer_archive FOR UPDATE TO authenticated
  USING (is_admin(auth.uid()));
CREATE POLICY "Archive: admin delete" ON public.buyer_archive FOR DELETE TO authenticated
  USING (is_admin(auth.uid()));

-- ---- team_members ----
DROP POLICY IF EXISTS "Team: owner select" ON public.team_members;
DROP POLICY IF EXISTS "Team: owner insert" ON public.team_members;
DROP POLICY IF EXISTS "Team: owner update" ON public.team_members;
DROP POLICY IF EXISTS "Team: owner delete" ON public.team_members;

CREATE POLICY "Team: scoped select" ON public.team_members FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Team: scoped insert" ON public.team_members FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Team: scoped update" ON public.team_members FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Team: scoped delete" ON public.team_members FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- title_companies ----
DROP POLICY IF EXISTS "TitleCo: owner select" ON public.title_companies;
DROP POLICY IF EXISTS "TitleCo: owner insert" ON public.title_companies;
DROP POLICY IF EXISTS "TitleCo: owner update" ON public.title_companies;
DROP POLICY IF EXISTS "TitleCo: owner delete" ON public.title_companies;

CREATE POLICY "TitleCo: scoped select" ON public.title_companies FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "TitleCo: scoped insert" ON public.title_companies FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "TitleCo: scoped update" ON public.title_companies FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "TitleCo: scoped delete" ON public.title_companies FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- jv_partners ----
DROP POLICY IF EXISTS "JV: owner all" ON public.jv_partners;

CREATE POLICY "JV: scoped select" ON public.jv_partners FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "JV: scoped insert" ON public.jv_partners FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "JV: scoped update" ON public.jv_partners FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "JV: scoped delete" ON public.jv_partners FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- kpi_snapshots ----
DROP POLICY IF EXISTS "KPI: owner all" ON public.kpi_snapshots;

CREATE POLICY "KPI: scoped select" ON public.kpi_snapshots FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "KPI: scoped insert" ON public.kpi_snapshots FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "KPI: scoped update" ON public.kpi_snapshots FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "KPI: scoped delete" ON public.kpi_snapshots FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- notifications ----
DROP POLICY IF EXISTS "Notifications: own select" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own insert" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own update" ON public.notifications;
DROP POLICY IF EXISTS "Notifications: own delete" ON public.notifications;

CREATE POLICY "Notifications: scoped select" ON public.notifications FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Notifications: scoped insert" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Notifications: scoped update" ON public.notifications FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "Notifications: scoped delete" ON public.notifications FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

-- ---- deal_files ----
DROP POLICY IF EXISTS "DealFiles: owner select" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: owner insert" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: owner update" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: owner delete" ON public.deal_files;

CREATE POLICY "DealFiles: scoped select" ON public.deal_files FOR SELECT TO authenticated
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()))
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "DealFiles: scoped insert" ON public.deal_files FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_files.deal_id AND d.user_id = auth.uid())
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "DealFiles: scoped update" ON public.deal_files FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
CREATE POLICY "DealFiles: scoped delete" ON public.deal_files FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );
