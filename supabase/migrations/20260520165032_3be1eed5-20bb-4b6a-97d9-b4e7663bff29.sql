-- =====================================================================
-- TEAM MERGE MIGRATION (Phases 1 + 3)
-- =====================================================================

-- ---------------------------------------------------------------------
-- Audit log table
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.merge_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase int NOT NULL,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  executed_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','partial','failed','warning'))
);
ALTER TABLE public.merge_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "merge_audit_log: admin read" ON public.merge_audit_log;
CREATE POLICY "merge_audit_log: admin read"
  ON public.merge_audit_log FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "merge_audit_log: deny write" ON public.merge_audit_log;
CREATE POLICY "merge_audit_log: deny write"
  ON public.merge_audit_log FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------
-- Phase 1a: schema
-- ---------------------------------------------------------------------
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS linked_user_id uuid;
CREATE INDEX IF NOT EXISTS idx_team_members_linked_user
  ON public.team_members(ghl_location_id, linked_user_id);

-- ---------------------------------------------------------------------
-- Phase 1b: additive RLS (old creator-only policies are kept per R6)
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS "Team: location owner insert" ON public.team_members;
CREATE POLICY "Team: location owner insert" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (
    ghl_location_id IS NOT NULL
    AND public.is_location_owner(auth.uid(), ghl_location_id)
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

DROP POLICY IF EXISTS "Team: location owner update" ON public.team_members;
CREATE POLICY "Team: location owner update" ON public.team_members
  FOR UPDATE TO authenticated
  USING (
    ghl_location_id IS NOT NULL
    AND public.is_location_owner(auth.uid(), ghl_location_id)
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  )
  WITH CHECK (
    ghl_location_id IS NOT NULL
    AND public.is_location_owner(auth.uid(), ghl_location_id)
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

DROP POLICY IF EXISTS "Team: location owner delete" ON public.team_members;
CREATE POLICY "Team: location owner delete" ON public.team_members
  FOR DELETE TO authenticated
  USING (
    ghl_location_id IS NOT NULL
    AND public.is_location_owner(auth.uid(), ghl_location_id)
    AND (public.current_ghl_location() IS NULL OR ghl_location_id = public.current_ghl_location())
  );

DROP POLICY IF EXISTS "Team: location member select" ON public.team_members;
CREATE POLICY "Team: location member select" ON public.team_members
  FOR SELECT TO authenticated
  USING (
    ghl_location_id IS NOT NULL
    AND (
      public.is_location_member(auth.uid(), ghl_location_id)
      OR (public.current_ghl_location() IS NOT NULL AND ghl_location_id = public.current_ghl_location())
      OR (public.current_ghl_location() IS NOT NULL AND public.location_in_active_group(ghl_location_id))
    )
  );

-- ---------------------------------------------------------------------
-- Phase 1c: idempotent backfill from location_memberships → team_members
-- ---------------------------------------------------------------------
WITH inserted AS (
  INSERT INTO public.team_members
    (user_id, ghl_location_id, linked_user_id, name, email, role, is_active)
  SELECT
    lm.user_id,
    lm.location_id,
    lm.user_id,
    COALESCE(p.name, p.email, lm.user_id::text),
    p.email,
    CASE WHEN lm.is_owner THEN 'dispo_manager' ELSE 'other' END,
    true
  FROM public.location_memberships lm
  LEFT JOIN public.profiles p ON p.user_id = lm.user_id
  WHERE NOT EXISTS (
    SELECT 1 FROM public.team_members tm
    WHERE tm.ghl_location_id = lm.location_id
      AND tm.linked_user_id = lm.user_id
  )
  RETURNING id
)
INSERT INTO public.merge_audit_log (phase, summary, status)
SELECT 1,
       jsonb_build_object(
         'description', 'Backfilled team_members from location_memberships',
         'backfilled_count', (SELECT count(*) FROM inserted),
         'role_mapping', jsonb_build_object('is_owner_true','dispo_manager','member','other')
       ),
       'ok';

-- ---------------------------------------------------------------------
-- Phase 1d: auto-link trigger on location_memberships (with collision guard)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_team_member_link_from_membership()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_name text;
  v_match_count int;
  v_match_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT email, name INTO v_email, v_name
      FROM public.profiles WHERE user_id = NEW.user_id;

    -- already linked? nothing to do
    IF EXISTS (
      SELECT 1 FROM public.team_members
      WHERE ghl_location_id = NEW.location_id AND linked_user_id = NEW.user_id
    ) THEN
      RETURN NEW;
    END IF;

    -- try link by email (with collision guard)
    IF v_email IS NOT NULL THEN
      SELECT count(*), min(id) INTO v_match_count, v_match_id
        FROM public.team_members
        WHERE ghl_location_id = NEW.location_id
          AND linked_user_id IS NULL
          AND lower(email) = lower(v_email);

      IF v_match_count = 1 THEN
        UPDATE public.team_members SET linked_user_id = NEW.user_id WHERE id = v_match_id;
        RETURN NEW;
      ELSIF v_match_count > 1 THEN
        INSERT INTO public.merge_audit_log (phase, summary, status)
          VALUES (1, jsonb_build_object(
            'event','auto_link_collision',
            'location_id', NEW.location_id,
            'user_id', NEW.user_id,
            'email', v_email,
            'candidate_count', v_match_count
          ), 'warning');
        RETURN NEW;
      END IF;
    END IF;

    -- no match → create new roster row
    INSERT INTO public.team_members
      (user_id, ghl_location_id, linked_user_id, name, email, role, is_active)
    VALUES (
      NEW.user_id, NEW.location_id, NEW.user_id,
      COALESCE(v_name, v_email, NEW.user_id::text),
      v_email,
      CASE WHEN NEW.is_owner THEN 'dispo_manager' ELSE 'other' END,
      true
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.team_members
       SET linked_user_id = NULL, is_active = false
     WHERE ghl_location_id = OLD.location_id AND linked_user_id = OLD.user_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_team_member_link_ins ON public.location_memberships;
CREATE TRIGGER trg_sync_team_member_link_ins
  AFTER INSERT ON public.location_memberships
  FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_link_from_membership();

DROP TRIGGER IF EXISTS trg_sync_team_member_link_del ON public.location_memberships;
CREATE TRIGGER trg_sync_team_member_link_del
  AFTER DELETE ON public.location_memberships
  FOR EACH ROW EXECUTE FUNCTION public.sync_team_member_link_from_membership();

-- ---------------------------------------------------------------------
-- Phase 3: remap deals.owner_id (auth uid → team_members.id), per-row log
-- ---------------------------------------------------------------------
DO $$
DECLARE
  r record;
  v_tm_id uuid;
  v_remapped int := 0;
  v_nulled int := 0;
  v_total int := 0;
  v_rows jsonb := '[]'::jsonb;
BEGIN
  FOR r IN
    SELECT id, owner_id, ghl_location_id
      FROM public.deals
     WHERE owner_id IS NOT NULL
  LOOP
    v_total := v_total + 1;
    v_tm_id := NULL;

    IF r.ghl_location_id IS NOT NULL THEN
      SELECT id INTO v_tm_id
        FROM public.team_members
       WHERE ghl_location_id = r.ghl_location_id
         AND linked_user_id = r.owner_id
       LIMIT 1;
    END IF;

    IF v_tm_id IS NOT NULL THEN
      UPDATE public.deals SET owner_id = v_tm_id WHERE id = r.id;
      v_remapped := v_remapped + 1;
      v_rows := v_rows || jsonb_build_object(
        'deal_id', r.id, 'old_owner_id', r.owner_id,
        'new_owner_id', v_tm_id, 'match_method', 'linked_user_id'
      );
    ELSE
      UPDATE public.deals SET owner_id = NULL WHERE id = r.id;
      v_nulled := v_nulled + 1;
      v_rows := v_rows || jsonb_build_object(
        'deal_id', r.id, 'old_owner_id', r.owner_id,
        'new_owner_id', null, 'match_method', 'nulled_no_match'
      );
    END IF;
  END LOOP;

  INSERT INTO public.merge_audit_log (phase, summary, status)
    VALUES (3, jsonb_build_object(
      'description', 'Remapped deals.owner_id from auth user_id to team_members.id',
      'total_processed', v_total,
      'remapped_successfully', v_remapped,
      'nulled_no_match', v_nulled,
      'rows', v_rows
    ), CASE WHEN v_nulled > 0 THEN 'partial' ELSE 'ok' END);
END $$;

-- ---------------------------------------------------------------------
-- Phase 2 + Phase 4 markers (code shipping alongside this migration)
-- ---------------------------------------------------------------------
INSERT INTO public.merge_audit_log (phase, summary, status) VALUES
  (2, jsonb_build_object(
    'description','Unified Settings → Team tab shipped',
    'changes', jsonb_build_array(
      'Removed Wholesaling Team tab',
      'Renamed Team tab to merged version',
      'Add Member modal: Name+Role required, Email+Phone optional, Invite-to-log-in checkbox'
    )
  ), 'ok'),
  (4, jsonb_build_object(
    'description','Cleanup',
    'changes', jsonb_build_array(
      'TeamMembersTab.tsx renamed to TeamMembersTab.legacy.tsx (kept for rollback, R5)',
      '/team route already redirects to /settings?tab=team',
      'Old team_members RLS policies kept for one cycle (R6)'
    )
  ), 'ok');
