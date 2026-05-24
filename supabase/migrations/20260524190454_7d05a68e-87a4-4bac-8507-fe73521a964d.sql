CREATE OR REPLACE FUNCTION public.seed_deal_checklist_from_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_items text[];
BEGIN
  -- Skip if checklist already populated (e.g. inserted client-side by AddDealModal)
  IF EXISTS (SELECT 1 FROM public.deal_checklist WHERE deal_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  -- Resolve workspace owner: prefer ghl_location_links.workspace_owner_user_id,
  -- fall back to the deal's creator user_id.
  IF NEW.ghl_location_id IS NOT NULL THEN
    SELECT workspace_owner_user_id INTO v_owner
    FROM public.ghl_location_links
    WHERE ghl_location_id = NEW.ghl_location_id
    ORDER BY linked_at ASC
    LIMIT 1;
  END IF;

  IF v_owner IS NULL THEN
    v_owner := NEW.user_id;
  END IF;

  IF v_owner IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT default_checklist INTO v_items
  FROM public.profiles
  WHERE user_id = v_owner;

  IF v_items IS NULL OR array_length(v_items, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.deal_checklist (deal_id, item_text, sort_order)
  SELECT NEW.id, item, ord - 1
  FROM unnest(v_items) WITH ORDINALITY AS t(item, ord);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_seed_deal_checklist ON public.deals;

CREATE TRIGGER trg_seed_deal_checklist
AFTER INSERT ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.seed_deal_checklist_from_owner();