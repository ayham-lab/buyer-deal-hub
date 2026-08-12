-- Ownership of a GHL location is first-established-wins. Standalone RLS hides
-- other users' link rows, so client-side "existing owner" checks (Login.tsx,
-- LocationContext.tsx) come back empty and would insert the caller as owner of
-- a location that already belongs to another workspace. The "GHLLinks: self
-- insert" policy also leaves workspace_owner_user_id unconstrained, so a
-- forged direct insert could claim any location.
--
-- This BEFORE INSERT trigger coerces workspace_owner_user_id on every new row
-- to the location's already-established owner (earliest link row). The insert
-- still succeeds — the user joins as a member — but ownership never moves via
-- INSERT. It runs before trg_sync_membership_from_ghl_link (AFTER INSERT), so
-- the membership role is derived from the coerced owner.
--
-- Deliberate ownership transfers are unaffected: apply-ownership-patch and
-- manual-review resolution normalize owners via UPDATE, which this trigger
-- does not touch.

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
