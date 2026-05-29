
-- Fix deal_files RLS to match deals access pattern (team members + webhook-imported deals)
DROP POLICY IF EXISTS "DealFiles: operator group select" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: scoped select" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: scoped insert" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: scoped update" ON public.deal_files;
DROP POLICY IF EXISTS "DealFiles: scoped delete" ON public.deal_files;

CREATE POLICY "DealFiles: select" ON public.deal_files
FOR SELECT USING (
  auth.uid() = user_id
  OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
  OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
  OR (ghl_location_id IS NOT NULL AND location_in_active_group(ghl_location_id))
  OR is_admin(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "DealFiles: insert" ON public.deal_files
FOR INSERT WITH CHECK (
  auth.uid() = user_id
  AND (
    (current_ghl_location() IS NULL)
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
  AND (
    is_admin(auth.uid())
    OR is_super_admin(auth.uid())
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
    OR EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_files.deal_id AND d.user_id = auth.uid())
  )
);

CREATE POLICY "DealFiles: update" ON public.deal_files
FOR UPDATE USING (
  auth.uid() = user_id
  OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
  OR is_admin(auth.uid())
  OR is_super_admin(auth.uid())
);

CREATE POLICY "DealFiles: delete" ON public.deal_files
FOR DELETE USING (
  auth.uid() = user_id
  OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
  OR is_admin(auth.uid())
  OR is_super_admin(auth.uid())
);

-- Idempotency for backfill
CREATE UNIQUE INDEX IF NOT EXISTS deal_files_file_path_uidx ON public.deal_files(file_path);
