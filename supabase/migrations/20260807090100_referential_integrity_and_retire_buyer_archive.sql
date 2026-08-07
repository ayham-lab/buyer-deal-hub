-- ============================================================================
-- Real foreign keys on the relationships that currently orphan, and removal of
-- the dead buyer_archive table.
--
-- Kept separate from 20260807090000 on purpose: this file contains an
-- irreversible DROP TABLE and constraint validation scans that can be slow or
-- lock-contended on large tables. Splitting them means a stall here cannot roll
-- back the security fixes in the previous migration.
--
-- DESTRUCTIVE. The orphan sweeps below DELETE rows. Run
-- supabase/tests/pre_migration_audit.sql (section A1) first and export the
-- counts -- those deletes cannot be undone by a counter-migration.
--
-- These are a correctness fix rather than hygiene: src/pages/Admin.tsx hard
-- deletes rows from `deals`, and today that silently orphans deal_activity and
-- deal_assignees, because the RLS on those tables joins back to deals and so
-- makes the leftovers invisible rather than absent.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- 0. PREREQUISITE: stop the audit triggers writing activity rows for deals that
--    no longer exist.
--
--    log_assignee_changes() and log_offer_changes() both INSERT into
--    deal_activity from their DELETE branch, using OLD.deal_id. When a deal is
--    deleted, deal_offers (which already had ON DELETE CASCADE) and
--    deal_assignees (cascading as of this migration) are removed, and those
--    AFTER DELETE triggers fire -- at which point the parent deal row is already
--    gone. Without a FK that merely produced orphan rows, which is how the
--    orphans this migration cleans up were created in the first place. WITH the
--    FK it becomes a foreign_key_violation that aborts the delete outright.
--
--    So: only record the removal if the deal itself survives. Deleting a deal
--    already logs its own deletion; per-child rows are noise at that point.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_assignee_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value, metadata)
    VALUES (NEW.deal_id, auth.uid(), 'assignee_added', NEW.team_member_id::text,
            jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.deals d WHERE d.id = OLD.deal_id) THEN
      INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, metadata)
      VALUES (OLD.deal_id, auth.uid(), 'assignee_removed', OLD.team_member_id::text,
              jsonb_build_object('role', OLD.role));
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.log_offer_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_buyer_name text;
  v_old_buyer_name text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT COALESCE(name, first_name || ' ' || last_name, 'Unknown buyer') INTO v_buyer_name
      FROM public.buyers WHERE id = NEW.buyer_id;
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value, metadata)
    VALUES (NEW.deal_id, COALESCE(NEW.created_by, auth.uid()), 'offer_added',
      'Offer from ' || COALESCE(v_buyer_name,'Unknown') || ' for $' || NEW.offer_amount::text,
      jsonb_build_object('offer_id', NEW.id, 'buyer_id', NEW.buyer_id, 'buyer_name', v_buyer_name,
        'amount', NEW.offer_amount, 'status', NEW.status));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    SELECT COALESCE(name, first_name || ' ' || last_name, 'Unknown buyer') INTO v_buyer_name
      FROM public.buyers WHERE id = NEW.buyer_id;
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
      VALUES (NEW.deal_id, auth.uid(), 'offer_status_changed', OLD.status, NEW.status,
        jsonb_build_object('offer_id', NEW.id, 'buyer_name', v_buyer_name));
    END IF;
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value, metadata)
    VALUES (NEW.deal_id, auth.uid(), 'offer_updated',
      'Offer from ' || COALESCE(v_buyer_name,'Unknown'),
      jsonb_build_object('offer_id', NEW.id, 'buyer_name', v_buyer_name,
        'amount', NEW.offer_amount, 'status', NEW.status));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM public.deals d WHERE d.id = OLD.deal_id) THEN
      SELECT COALESCE(name, first_name || ' ' || last_name, 'Unknown buyer') INTO v_old_buyer_name
        FROM public.buyers WHERE id = OLD.buyer_id;
      INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, metadata)
      VALUES (OLD.deal_id, auth.uid(), 'offer_deleted',
        'Offer from ' || COALESCE(v_old_buyer_name,'Unknown') || ' for $' || OLD.offer_amount::text,
        jsonb_build_object('offer_id', OLD.id, 'buyer_name', v_old_buyer_name,
          'amount', OLD.offer_amount));
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;


-- ---------------------------------------------------------------------------
-- 1. deal_activity.deal_id -> deals(id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'deal_activity_deal_id_fkey'
       AND conrelid = 'public.deal_activity'::regclass
  ) THEN
    DELETE FROM public.deal_activity a
     WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = a.deal_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'deal_activity: deleted % orphan row(s)', n;

    ALTER TABLE public.deal_activity
      ADD CONSTRAINT deal_activity_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.deal_activity VALIDATE CONSTRAINT deal_activity_deal_id_fkey;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 2. deal_assignees.deal_id -> deals(id)
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'deal_assignees_deal_id_fkey'
       AND conrelid = 'public.deal_assignees'::regclass
  ) THEN
    DELETE FROM public.deal_assignees x
     WHERE NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.id = x.deal_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'deal_assignees (deal_id): deleted % orphan row(s)', n;

    ALTER TABLE public.deal_assignees
      ADD CONSTRAINT deal_assignees_deal_id_fkey
      FOREIGN KEY (deal_id) REFERENCES public.deals(id) ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.deal_assignees VALIDATE CONSTRAINT deal_assignees_deal_id_fkey;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 3. deal_assignees.team_member_id -> team_members(id)
--
--    Most likely source of orphans: roster rows are deleted routinely from the
--    Team settings screen and nothing has ever cleaned up their assignments.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'deal_assignees_team_member_id_fkey'
       AND conrelid = 'public.deal_assignees'::regclass
  ) THEN
    DELETE FROM public.deal_assignees x
     WHERE NOT EXISTS (SELECT 1 FROM public.team_members m WHERE m.id = x.team_member_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'deal_assignees (team_member_id): deleted % orphan row(s)', n;

    ALTER TABLE public.deal_assignees
      ADD CONSTRAINT deal_assignees_team_member_id_fkey
      FOREIGN KEY (team_member_id) REFERENCES public.team_members(id) ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.deal_assignees VALIDATE CONSTRAINT deal_assignees_team_member_id_fkey;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 4. archive_buyer_reveals.buyer_id -> archive_buyers(id)
--
--    This is the paywall ledger and it was never referentially enforced.
--
--    ON DELETE CASCADE is a deliberate choice. The admin console hard deletes
--    archive_buyers rows; with NO ACTION that delete would start failing
--    whenever any tenant had paid to reveal that buyer. Once the buyer row is
--    gone the reveal is unredeemable anyway, because get_archive_buyer_contact
--    reads the buyer row.
--
--    ACCEPTED EDGE CASE: if a deleted buyer is later re-imported with a fresh
--    id, a tenant who already paid can be charged again for the same contact.
-- ---------------------------------------------------------------------------
DO $$
DECLARE n bigint;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'archive_buyer_reveals_buyer_id_fkey'
       AND conrelid = 'public.archive_buyer_reveals'::regclass
  ) THEN
    DELETE FROM public.archive_buyer_reveals r
     WHERE NOT EXISTS (SELECT 1 FROM public.archive_buyers b WHERE b.id = r.buyer_id);
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE 'archive_buyer_reveals: deleted % orphan row(s)', n;

    ALTER TABLE public.archive_buyer_reveals
      ADD CONSTRAINT archive_buyer_reveals_buyer_id_fkey
      FOREIGN KEY (buyer_id) REFERENCES public.archive_buyers(id) ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.archive_buyer_reveals VALIDATE CONSTRAINT archive_buyer_reveals_buyer_id_fkey;
  END IF;
END $$;


-- ---------------------------------------------------------------------------
-- 5. Retire public.buyer_archive.
--
--    The legacy per-workspace "shared buyer" table from the very first
--    migration. Superseded by the global archive_buyers; write-dead since
--    20260514145537 dropped trg_buyers_sync_archive and buyers_sync_to_archive().
--    Nothing has inserted into it since. It has no inbound foreign keys, and its
--    only remaining consumer was a row-count tile on the Admin overview plus an
--    ArchiveTab component that was never mounted -- both removed in the
--    accompanying application change.
--
--    Intentionally NOT `CASCADE`: if something unexpectedly still depends on
--    this table, this should fail loudly rather than silently amputate it.
-- ---------------------------------------------------------------------------
DROP TABLE IF EXISTS public.buyer_archive;
