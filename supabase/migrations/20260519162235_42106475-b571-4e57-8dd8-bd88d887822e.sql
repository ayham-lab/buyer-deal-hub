
CREATE TABLE public.deal_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
  ghl_location_id text,
  user_id uuid,
  offer_amount numeric NOT NULL,
  emd_amount numeric,
  ideal_closing_date date,
  offer_date date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','accepted','countered','rejected','withdrawn')),
  contingencies text[] NOT NULL DEFAULT '{}',
  contingencies_other text,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deal_offers_deal_id ON public.deal_offers(deal_id);
CREATE INDEX idx_deal_offers_location ON public.deal_offers(ghl_location_id);
CREATE INDEX idx_deal_offers_buyer_id ON public.deal_offers(buyer_id);
CREATE INDEX idx_deal_offers_status ON public.deal_offers(status);

ALTER TABLE public.deal_offers ENABLE ROW LEVEL SECURITY;

-- Mirror deals scoping: anyone with read access to the deal can see/edit offers.
CREATE POLICY "Offers: scoped select" ON public.deal_offers
FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_offers.deal_id
    AND ((current_ghl_location() IS NULL AND (d.user_id = auth.uid() OR is_admin(auth.uid())))
      OR (current_ghl_location() IS NOT NULL AND d.ghl_location_id IS NOT NULL AND d.ghl_location_id = current_ghl_location())))
);

CREATE POLICY "Offers: operator group select" ON public.deal_offers
FOR SELECT TO authenticated
USING (
  current_ghl_location() IS NOT NULL
  AND ghl_location_id IS NOT NULL
  AND location_in_active_group(ghl_location_id)
);

CREATE POLICY "Offers: scoped insert" ON public.deal_offers
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_offers.deal_id
    AND ((current_ghl_location() IS NULL AND d.user_id = auth.uid())
      OR (current_ghl_location() IS NOT NULL AND d.ghl_location_id IS NOT NULL AND d.ghl_location_id = current_ghl_location())))
  AND ((current_ghl_location() IS NULL) OR (ghl_location_id = current_ghl_location()))
);

CREATE POLICY "Offers: scoped update" ON public.deal_offers
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_offers.deal_id
    AND ((current_ghl_location() IS NULL AND d.user_id = auth.uid())
      OR (current_ghl_location() IS NOT NULL AND d.ghl_location_id IS NOT NULL AND d.ghl_location_id = current_ghl_location())))
);

CREATE POLICY "Offers: scoped delete" ON public.deal_offers
FOR DELETE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_offers.deal_id
    AND ((current_ghl_location() IS NULL AND d.user_id = auth.uid())
      OR (current_ghl_location() IS NOT NULL AND d.ghl_location_id IS NOT NULL AND d.ghl_location_id = current_ghl_location())))
);

CREATE TRIGGER update_deal_offers_updated_at
BEFORE UPDATE ON public.deal_offers
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Audit log triggers: write rows to deal_activity for insert/update/delete.
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
      jsonb_build_object('offer_id', NEW.id, 'buyer_name', v_buyer_name, 'amount', NEW.offer_amount, 'status', NEW.status));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT COALESCE(name, first_name || ' ' || last_name, 'Unknown buyer') INTO v_old_buyer_name
      FROM public.buyers WHERE id = OLD.buyer_id;
    INSERT INTO public.deal_activity(deal_id, user_id, event_type, from_value, metadata)
    VALUES (OLD.deal_id, auth.uid(), 'offer_deleted',
      'Offer from ' || COALESCE(v_old_buyer_name,'Unknown') || ' for $' || OLD.offer_amount::text,
      jsonb_build_object('offer_id', OLD.id, 'buyer_name', v_old_buyer_name, 'amount', OLD.offer_amount));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER deal_offers_audit_trigger
AFTER INSERT OR UPDATE OR DELETE ON public.deal_offers
FOR EACH ROW EXECUTE FUNCTION public.log_offer_changes();
