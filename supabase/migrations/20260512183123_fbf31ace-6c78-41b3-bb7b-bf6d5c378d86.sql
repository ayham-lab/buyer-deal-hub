
CREATE OR REPLACE FUNCTION public.sync_membership_from_ghl_link()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  is_first_owner boolean;
BEGIN
  -- Is this user the workspace owner for this location?
  is_first_owner := (NEW.user_id = NEW.workspace_owner_user_id);

  INSERT INTO public.location_memberships (location_id, user_id, role, is_owner)
  VALUES (
    NEW.ghl_location_id,
    NEW.user_id,
    CASE WHEN is_first_owner THEN 'owner' ELSE 'member' END,
    is_first_owner
  )
  ON CONFLICT (location_id, user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_membership_from_ghl_link
AFTER INSERT ON public.ghl_location_links
FOR EACH ROW EXECUTE FUNCTION public.sync_membership_from_ghl_link();
