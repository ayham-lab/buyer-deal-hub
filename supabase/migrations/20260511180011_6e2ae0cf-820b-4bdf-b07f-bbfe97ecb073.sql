
-- credit_packs
CREATE TABLE public.credit_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  credits integer NOT NULL CHECK (credits > 0),
  price_cents integer NOT NULL CHECK (price_cents >= 0),
  stripe_price_id text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_packs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_packs: read active" ON public.credit_packs
  FOR SELECT TO authenticated, anon
  USING (is_active = true OR is_admin(auth.uid()));

CREATE POLICY "credit_packs: standalone admin manage" ON public.credit_packs
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND current_ghl_location() IS NULL)
  WITH CHECK (is_admin(auth.uid()) AND current_ghl_location() IS NULL);

INSERT INTO public.credit_packs (name, credits, price_cents, sort_order) VALUES
  ('Starter', 100, 2500, 1),
  ('Standard', 500, 9900, 2),
  ('Pro', 1500, 24900, 3),
  ('Volume', 5000, 74900, 4);

-- credit_action_costs
CREATE TABLE public.credit_action_costs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_key text NOT NULL UNIQUE,
  credits integer NOT NULL CHECK (credits >= 0),
  is_active boolean NOT NULL DEFAULT true
);
ALTER TABLE public.credit_action_costs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_action_costs: read active" ON public.credit_action_costs
  FOR SELECT TO authenticated, anon
  USING (is_active = true OR is_admin(auth.uid()));

CREATE POLICY "credit_action_costs: standalone admin manage" ON public.credit_action_costs
  FOR ALL TO authenticated
  USING (is_admin(auth.uid()) AND current_ghl_location() IS NULL)
  WITH CHECK (is_admin(auth.uid()) AND current_ghl_location() IS NULL);

INSERT INTO public.credit_action_costs (action_key, credits) VALUES
  ('skiptrace', 1),
  ('archive_reveal', 3),
  ('public_records', 2);

-- credit_balances
CREATE TABLE public.credit_balances (
  ghl_location_id text PRIMARY KEY,
  balance integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_balances: scoped read" ON public.credit_balances
  FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

CREATE POLICY "credit_balances: deny write insert" ON public.credit_balances
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "credit_balances: deny write update" ON public.credit_balances
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "credit_balances: deny write delete" ON public.credit_balances
  FOR DELETE TO authenticated, anon USING (false);

-- credit_transactions
CREATE TABLE public.credit_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_location_id text NOT NULL,
  delta integer NOT NULL,
  action_key text,
  related_id text,
  stripe_session_id text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_credit_tx_location ON public.credit_transactions(ghl_location_id, created_at DESC);
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "credit_tx: scoped read" ON public.credit_transactions
  FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

CREATE POLICY "credit_tx: deny insert" ON public.credit_transactions
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "credit_tx: deny update" ON public.credit_transactions
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "credit_tx: deny delete" ON public.credit_transactions
  FOR DELETE TO authenticated, anon USING (false);

-- archive_buyer_reveals
CREATE TABLE public.archive_buyer_reveals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_location_id text NOT NULL,
  buyer_id uuid NOT NULL,
  revealed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ghl_location_id, buyer_id)
);
ALTER TABLE public.archive_buyer_reveals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reveals: scoped read" ON public.archive_buyer_reveals
  FOR SELECT TO authenticated
  USING (
    (current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    OR (current_ghl_location() IS NULL AND is_admin(auth.uid()))
  );

CREATE POLICY "reveals: deny insert" ON public.archive_buyer_reveals
  FOR INSERT TO authenticated, anon WITH CHECK (false);
CREATE POLICY "reveals: deny update" ON public.archive_buyer_reveals
  FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "reveals: deny delete" ON public.archive_buyer_reveals
  FOR DELETE TO authenticated, anon USING (false);

-- consume_credits RPC
CREATE OR REPLACE FUNCTION public.consume_credits(
  p_location text,
  p_action text,
  p_related_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cost integer;
  v_updated integer;
BEGIN
  SELECT credits INTO v_cost FROM public.credit_action_costs
    WHERE action_key = p_action AND is_active = true;
  IF v_cost IS NULL THEN RETURN false; END IF;

  UPDATE public.credit_balances
    SET balance = balance - v_cost, updated_at = now()
    WHERE ghl_location_id = p_location AND balance >= v_cost;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RETURN false; END IF;

  INSERT INTO public.credit_transactions
    (ghl_location_id, delta, action_key, related_id, description)
    VALUES (p_location, -v_cost, p_action, p_related_id,
            'Consumed ' || v_cost || ' credit(s) for ' || p_action);
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credits(text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits(text, text, text) TO service_role;

-- updated_at trigger for credit_balances
CREATE TRIGGER credit_balances_updated_at
  BEFORE UPDATE ON public.credit_balances
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
