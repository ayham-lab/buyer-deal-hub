
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS deleted_by uuid NULL;

CREATE INDEX IF NOT EXISTS idx_deals_not_deleted ON public.deals (created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_deals_deleted_at ON public.deals (deleted_at DESC) WHERE deleted_at IS NOT NULL;

-- Replace SELECT policies to filter out soft-deleted rows for non-admins
DROP POLICY IF EXISTS "Deals: scoped select" ON public.deals;
CREATE POLICY "Deals: scoped select" ON public.deals
FOR SELECT TO authenticated
USING (
  (((auth.uid() = user_id) OR (user_id IS NULL) OR is_admin(auth.uid()))
   AND ((current_ghl_location() IS NULL) OR ((ghl_location_id IS NOT NULL) AND (ghl_location_id = current_ghl_location()))))
  AND (deleted_at IS NULL OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Deals: operator group select" ON public.deals;
CREATE POLICY "Deals: operator group select" ON public.deals
FOR SELECT TO authenticated
USING (
  (current_ghl_location() IS NOT NULL)
  AND (ghl_location_id IS NOT NULL)
  AND location_in_active_group(ghl_location_id)
  AND (deleted_at IS NULL OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Deals: public marketing read" ON public.deals;
CREATE POLICY "Deals: public marketing read" ON public.deals
FOR SELECT TO anon
USING (marketing_published = true AND deleted_at IS NULL);

-- Trigger: log soft-delete and resurrect to deal_activity
CREATE OR REPLACE FUNCTION public.log_deal_soft_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value, metadata)
      VALUES (NEW.id, COALESCE(NEW.deleted_by, auth.uid()), 'soft_deleted',
              NEW.deleted_at::text,
              jsonb_build_object('reason', 'manual_delete'));
    ELSIF NEW.deleted_at IS NULL AND OLD.deleted_at IS NOT NULL THEN
      INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, metadata)
      VALUES (NEW.id, auth.uid(), 'resurrected',
              OLD.deleted_at::text,
              jsonb_build_object('source', 'manual_undelete'));
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS deals_log_soft_delete ON public.deals;
CREATE TRIGGER deals_log_soft_delete
AFTER UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.log_deal_soft_delete();
