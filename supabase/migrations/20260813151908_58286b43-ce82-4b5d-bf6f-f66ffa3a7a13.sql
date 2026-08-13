CREATE OR REPLACE FUNCTION public.enforce_location_owner_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  established uuid;
BEGIN
  SELECT workspace_owner_user_id INTO established
  FROM public.ghl_location_links
  WHERE ghl_location_id = NEW.ghl_location_id
  ORDER BY linked_at ASC
  LIMIT 1;

  IF established IS NOT NULL THEN
    NEW.workspace_owner_user_id := established;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_location_owner_on_insert ON public.ghl_location_links;
CREATE TRIGGER trg_enforce_location_owner_on_insert
BEFORE INSERT ON public.ghl_location_links
FOR EACH ROW EXECUTE FUNCTION public.enforce_location_owner_on_insert();