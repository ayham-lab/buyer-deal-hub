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

DROP TABLE IF EXISTS public.buyer_archive;