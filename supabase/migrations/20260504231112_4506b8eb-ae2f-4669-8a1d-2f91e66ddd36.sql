
-- ============ deal_activity ============
CREATE TABLE public.deal_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  user_id uuid,
  event_type text NOT NULL,
  from_value text,
  to_value text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deal_activity_deal ON public.deal_activity(deal_id, created_at DESC);
ALTER TABLE public.deal_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DealActivity: owner select" ON public.deal_activity
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_activity.deal_id AND (d.user_id = auth.uid() OR public.is_admin(auth.uid()))));

CREATE POLICY "DealActivity: owner insert" ON public.deal_activity
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_activity.deal_id AND d.user_id = auth.uid()));

-- ============ notifications ============
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link_url text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON public.notifications(user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notifications: own select" ON public.notifications
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications: own update" ON public.notifications
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications: own delete" ON public.notifications
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Notifications: own insert" ON public.notifications
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ============ Activity logging trigger on deals ============
CREATE OR REPLACE FUNCTION public.log_deal_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value)
    VALUES (NEW.id, uid, 'status_change', OLD.status::text, NEW.status::text);
  END IF;
  IF NEW.emd_received IS DISTINCT FROM OLD.emd_received AND NEW.emd_received = true THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value)
    VALUES (NEW.id, uid, 'emd_received', NEW.emd_amount::text);
  END IF;
  IF NEW.closing_date IS DISTINCT FROM OLD.closing_date THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.closing_date::text, NEW.closing_date::text, jsonb_build_object('field','closing_date'));
  END IF;
  IF NEW.assignment_fee IS DISTINCT FROM OLD.assignment_fee THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.assignment_fee::text, NEW.assignment_fee::text, jsonb_build_object('field','assignment_fee'));
  END IF;
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.buyer_id::text, NEW.buyer_id::text, jsonb_build_object('field','buyer_id'));
  END IF;
  IF NEW.title_company_id IS DISTINCT FROM OLD.title_company_id THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.title_company_id::text, NEW.title_company_id::text, jsonb_build_object('field','title_company_id'));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER deals_log_changes
AFTER UPDATE ON public.deals
FOR EACH ROW EXECUTE FUNCTION public.log_deal_changes();

-- ============ Activity logging triggers on assignees/files ============
CREATE OR REPLACE FUNCTION public.log_assignee_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value, metadata)
    VALUES (NEW.deal_id, auth.uid(), 'assignee_added', NEW.team_member_id::text, jsonb_build_object('role', NEW.role));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, metadata)
    VALUES (OLD.deal_id, auth.uid(), 'assignee_removed', OLD.team_member_id::text, jsonb_build_object('role', OLD.role));
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER deal_assignees_log AFTER INSERT OR DELETE ON public.deal_assignees
FOR EACH ROW EXECUTE FUNCTION public.log_assignee_changes();

CREATE OR REPLACE FUNCTION public.log_file_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.deal_activity(deal_id, user_id, event_type, to_value, metadata)
  VALUES (NEW.deal_id, auth.uid(), 'file_uploaded', NEW.file_name, jsonb_build_object('category', NEW.category, 'file_id', NEW.id));
  RETURN NEW;
END $$;
CREATE TRIGGER deal_files_log AFTER INSERT ON public.deal_files
FOR EACH ROW EXECUTE FUNCTION public.log_file_changes();
