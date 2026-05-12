-- Wire the existing sync_membership_from_ghl_link function as a trigger so
-- every new ghl_location_links row auto-creates the matching
-- location_memberships row. Without this, members joining via iframe SSO
-- get locked out by the standalone /no-access gate.
DROP TRIGGER IF EXISTS trg_sync_membership_from_ghl_link ON public.ghl_location_links;
CREATE TRIGGER trg_sync_membership_from_ghl_link
AFTER INSERT ON public.ghl_location_links
FOR EACH ROW
EXECUTE FUNCTION public.sync_membership_from_ghl_link();

-- Backfill: create location_memberships for every existing ghl_location_links
-- row that doesn't already have one. Owner status mirrors the function logic
-- (user_id = workspace_owner_user_id => is_owner true).
INSERT INTO public.location_memberships (location_id, user_id, role, is_owner)
SELECT
  l.ghl_location_id,
  l.user_id,
  CASE WHEN l.user_id = l.workspace_owner_user_id THEN 'owner' ELSE 'member' END,
  (l.user_id = l.workspace_owner_user_id)
FROM public.ghl_location_links l
WHERE l.user_id IS NOT NULL
  AND l.ghl_location_id IS NOT NULL
ON CONFLICT (location_id, user_id) DO NOTHING;
