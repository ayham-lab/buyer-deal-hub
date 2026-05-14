
-- PART 1: credit_packs schema + data
ALTER TABLE public.credit_packs ADD COLUMN IF NOT EXISTS is_featured boolean NOT NULL DEFAULT false;

UPDATE public.credit_packs SET is_featured = false;

-- Wipe and reseed packs deterministically
DELETE FROM public.credit_packs;
INSERT INTO public.credit_packs (name, credits, price_cents, sort_order, is_active, is_featured) VALUES
  ('Starter', 100, 1000, 1, true, false),
  ('Growth', 500, 4000, 2, true, true),
  ('Pro', 1500, 10500, 3, true, false),
  ('Scale', 5000, 30000, 4, true, false);

-- PART 2: action costs
UPDATE public.credit_action_costs SET credits = 100 WHERE action_key = 'archive_reveal';
UPDATE public.credit_action_costs SET action_key = 'llc_skip', credits = 1 WHERE action_key = 'public_records';
-- Ensure rows exist if they didn't
INSERT INTO public.credit_action_costs (action_key, credits, is_active)
  SELECT 'archive_reveal', 100, true
  WHERE NOT EXISTS (SELECT 1 FROM public.credit_action_costs WHERE action_key = 'archive_reveal');
INSERT INTO public.credit_action_costs (action_key, credits, is_active)
  SELECT 'llc_skip', 1, true
  WHERE NOT EXISTS (SELECT 1 FROM public.credit_action_costs WHERE action_key = 'llc_skip');

-- PART 3: subscription_plans table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price_cents integer NOT NULL,
  stripe_price_id text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_plans: read active"
  ON public.subscription_plans FOR SELECT
  TO anon, authenticated
  USING ((is_active = true) OR public.is_admin(auth.uid()));

CREATE POLICY "subscription_plans: standalone admin manage"
  ON public.subscription_plans FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()) AND (public.current_ghl_location() IS NULL))
  WITH CHECK (public.is_admin(auth.uid()) AND (public.current_ghl_location() IS NULL));

CREATE TRIGGER subscription_plans_updated_at
  BEFORE UPDATE ON public.subscription_plans
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.subscription_plans (name, price_cents, description, is_active, sort_order)
VALUES ('Unlimited', 29700, 'Unlimited archive reveals and LLC skips. Cancel anytime.', true, 1);

-- PART 4: subscriptions table (per workspace / ghl_location_id)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_location_id text NOT NULL UNIQUE,
  subscription_plan_id uuid REFERENCES public.subscription_plans(id) ON DELETE SET NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  subscription_status text,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions: scoped read"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (
    ((public.current_ghl_location() IS NOT NULL) AND (ghl_location_id = public.current_ghl_location()))
    OR ((public.current_ghl_location() IS NULL) AND public.is_admin(auth.uid()))
  );

CREATE POLICY "subscriptions: deny insert"
  ON public.subscriptions FOR INSERT
  TO anon, authenticated
  WITH CHECK (false);

CREATE POLICY "subscriptions: deny update"
  ON public.subscriptions FOR UPDATE
  TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY "subscriptions: deny delete"
  ON public.subscriptions FOR DELETE
  TO anon, authenticated
  USING (false);

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX IF NOT EXISTS subscriptions_stripe_sub_idx ON public.subscriptions(stripe_subscription_id);

-- PART 5: consume_credits skips deduction when subscription active
CREATE OR REPLACE FUNCTION public.consume_credits(p_location text, p_action text, p_related_id text DEFAULT NULL::text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cost integer;
  v_updated integer;
  v_has_sub boolean;
BEGIN
  SELECT credits INTO v_cost FROM public.credit_action_costs
    WHERE action_key = p_action AND is_active = true;
  IF v_cost IS NULL THEN RETURN false; END IF;

  -- Active subscription bypass
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE ghl_location_id = p_location
      AND subscription_status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO v_has_sub;

  IF v_has_sub THEN
    INSERT INTO public.credit_transactions
      (ghl_location_id, delta, action_key, related_id, description)
      VALUES (p_location, 0, p_action, p_related_id,
              'Unlimited subscription: ' || p_action);
    RETURN true;
  END IF;

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
$function$;
