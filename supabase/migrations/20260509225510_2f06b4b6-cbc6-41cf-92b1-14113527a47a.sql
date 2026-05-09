-- 1) Add ghl_assigned_user_id and allow user_id NULL for GHL-imported deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ghl_assigned_user_id text;
ALTER TABLE public.deals ALTER COLUMN user_id DROP NOT NULL;

-- 2) Update RLS to allow GHL-imported (user_id IS NULL) rows within the scoped tenant
DROP POLICY IF EXISTS "Deals: scoped select" ON public.deals;
CREATE POLICY "Deals: scoped select"
ON public.deals FOR SELECT TO authenticated
USING (
  ((auth.uid() = user_id) OR user_id IS NULL OR is_admin(auth.uid()))
  AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
);

DROP POLICY IF EXISTS "Deals: scoped update" ON public.deals;
CREATE POLICY "Deals: scoped update"
ON public.deals FOR UPDATE TO authenticated
USING (
  ((auth.uid() = user_id) OR (user_id IS NULL AND current_ghl_location() IS NOT NULL))
  AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
);

DROP POLICY IF EXISTS "Deals: scoped delete" ON public.deals;
CREATE POLICY "Deals: scoped delete"
ON public.deals FOR DELETE TO authenticated
USING (
  ((auth.uid() = user_id) OR (user_id IS NULL AND current_ghl_location() IS NOT NULL))
  AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
);

-- 3) Backfill: any existing GHL-imported deals (have ghl_opportunity_id) currently
-- attributed to the workspace owner should be detached from that workspace user
-- so the Admin Console stops showing the wrong owner email.
UPDATE public.deals
SET user_id = NULL
WHERE ghl_opportunity_id IS NOT NULL;