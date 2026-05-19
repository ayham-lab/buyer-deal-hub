ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS price_under_contract numeric,
  ADD COLUMN IF NOT EXISTS expected_assignment numeric;

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
    VALUES (NEW.id, uid, 'field_updated', OLD.assignment_fee::text, NEW.assignment_fee::text, jsonb_build_object('field','actual_assignment'));
  END IF;
  IF NEW.buyer_id IS DISTINCT FROM OLD.buyer_id THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.buyer_id::text, NEW.buyer_id::text, jsonb_build_object('field','buyer_id'));
  END IF;
  IF NEW.title_company_id IS DISTINCT FROM OLD.title_company_id THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.title_company_id::text, NEW.title_company_id::text, jsonb_build_object('field','title_company_id'));
  END IF;
  IF NEW.price_under_contract IS DISTINCT FROM OLD.price_under_contract THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.price_under_contract::text, NEW.price_under_contract::text, jsonb_build_object('field','price_under_contract'));
  END IF;
  IF NEW.expected_assignment IS DISTINCT FROM OLD.expected_assignment THEN
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, to_value, metadata)
    VALUES (NEW.id, uid, 'field_updated', OLD.expected_assignment::text, NEW.expected_assignment::text, jsonb_build_object('field','expected_assignment'));
  END IF;
  RETURN NEW;
END $$;