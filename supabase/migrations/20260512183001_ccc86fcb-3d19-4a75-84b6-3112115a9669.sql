
-- ============================================================
-- location_memberships
-- ============================================================
CREATE TABLE public.location_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  is_owner boolean NOT NULL DEFAULT false,
  joined_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, user_id)
);

CREATE INDEX idx_location_memberships_user ON public.location_memberships(user_id);
CREATE INDEX idx_location_memberships_location ON public.location_memberships(location_id);

ALTER TABLE public.location_memberships ENABLE ROW LEVEL SECURITY;

-- helper: is the caller an owner of a given location?
CREATE OR REPLACE FUNCTION public.is_location_owner(_user_id uuid, _location_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.location_memberships
    WHERE user_id = _user_id AND location_id = _location_id AND is_owner = true
  )
$$;

-- helper: is the caller a member (any role) of a given location?
CREATE OR REPLACE FUNCTION public.is_location_member(_user_id uuid, _location_id text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.location_memberships
    WHERE user_id = _user_id AND location_id = _location_id
  )
$$;

-- SELECT: a user can see their own row, or any row at a location they own, or admins always.
CREATE POLICY "memberships: scoped select"
ON public.location_memberships FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
);

-- INSERT: only owners (or admins) can add members.
CREATE POLICY "memberships: owner insert"
ON public.location_memberships FOR INSERT TO authenticated
WITH CHECK (
  public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
);

-- UPDATE: only owners (or admins).
CREATE POLICY "memberships: owner update"
ON public.location_memberships FOR UPDATE TO authenticated
USING (
  public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
)
WITH CHECK (
  public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
);

-- DELETE: only owners (or admins).
CREATE POLICY "memberships: owner delete"
ON public.location_memberships FOR DELETE TO authenticated
USING (
  public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
);

-- Guard: an owner cannot remove themselves unless another owner exists for the location.
CREATE OR REPLACE FUNCTION public.prevent_last_owner_removal()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  remaining_owners int;
BEGIN
  IF OLD.is_owner = true THEN
    SELECT count(*) INTO remaining_owners
      FROM public.location_memberships
      WHERE location_id = OLD.location_id AND is_owner = true AND id <> OLD.id;
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot remove the last owner of a location. Transfer ownership first.';
    END IF;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER trg_prevent_last_owner_removal
BEFORE DELETE ON public.location_memberships
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_removal();

-- Same guard on UPDATE: cannot demote the last owner.
CREATE OR REPLACE FUNCTION public.prevent_last_owner_demotion()
RETURNS trigger
LANGUAGE plpgsql SET search_path = public
AS $$
DECLARE
  remaining_owners int;
BEGIN
  IF OLD.is_owner = true AND NEW.is_owner = false THEN
    SELECT count(*) INTO remaining_owners
      FROM public.location_memberships
      WHERE location_id = OLD.location_id AND is_owner = true AND id <> OLD.id;
    IF remaining_owners = 0 THEN
      RAISE EXCEPTION 'Cannot demote the last owner. Promote another member first.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_last_owner_demotion
BEFORE UPDATE ON public.location_memberships
FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_demotion();

-- ============================================================
-- pending_invites
-- ============================================================
CREATE TABLE public.pending_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  email text NOT NULL,
  invited_by_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pending_invites_token ON public.pending_invites(token);
CREATE INDEX idx_pending_invites_location ON public.pending_invites(location_id);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- Owners (and admins) can see invites for their locations.
CREATE POLICY "invites: owner select"
ON public.pending_invites FOR SELECT TO authenticated
USING (
  public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
);

-- Owners (and admins) can revoke (delete) invites.
CREATE POLICY "invites: owner delete"
ON public.pending_invites FOR DELETE TO authenticated
USING (
  public.is_location_owner(auth.uid(), location_id)
  OR public.is_admin(auth.uid())
);

-- INSERT/UPDATE happen in edge functions via service role only — no client policies.

-- ============================================================
-- Backfill memberships from existing ghl_location_links
-- ============================================================
INSERT INTO public.location_memberships (location_id, user_id, role, is_owner)
SELECT
  l.ghl_location_id,
  l.user_id,
  CASE WHEN l.user_id = l.workspace_owner_user_id THEN 'owner' ELSE 'member' END,
  (l.user_id = l.workspace_owner_user_id)
FROM public.ghl_location_links l
ON CONFLICT (location_id, user_id) DO NOTHING;
