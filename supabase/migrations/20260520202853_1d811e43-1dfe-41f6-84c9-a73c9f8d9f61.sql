
-- Part 1: soft_delete_deal RPC
CREATE OR REPLACE FUNCTION public.soft_delete_deal(p_deal_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_affected int; v_caller uuid; v_loc text; v_user uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RETURN false; END IF;

  SELECT ghl_location_id, user_id INTO v_loc, v_user FROM public.deals WHERE id = p_deal_id;
  IF NOT FOUND THEN RETURN false; END IF;

  IF NOT (
    v_user = v_caller
    OR (v_loc IS NOT NULL AND public.is_location_member(v_caller, v_loc))
    OR public.is_admin(v_caller)
    OR public.is_super_admin(v_caller)
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.deals
    SET deleted_at = now(), deleted_by = v_caller
    WHERE id = p_deal_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected > 0;
END;
$$;

GRANT EXECUTE ON FUNCTION public.soft_delete_deal(uuid) TO authenticated;

-- Part 2: loosen Deals: scoped select so location members / owners can read deleted rows
-- (app layer filters them out from normal views; Recently Deleted reveals them)
DROP POLICY IF EXISTS "Deals: scoped select" ON public.deals;
CREATE POLICY "Deals: scoped select" ON public.deals
FOR SELECT TO authenticated
USING (
  ((auth.uid() = user_id) OR (user_id IS NULL) OR is_admin(auth.uid()))
  AND (
    current_ghl_location() IS NULL
    OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location())
  )
  AND (
    deleted_at IS NULL
    OR auth.uid() = user_id
    OR (ghl_location_id IS NOT NULL AND public.is_location_member(auth.uid(), ghl_location_id))
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
);
