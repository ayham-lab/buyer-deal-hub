
-- Operator Accounts table
CREATE TABLE public.operator_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text DEFAULT 'inactive',
  current_period_end timestamptz,
  credit_balance integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.operator_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "operator_accounts: owner read"
  ON public.operator_accounts FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid() OR is_super_admin(auth.uid()));

CREATE POLICY "operator_accounts: owner insert"
  ON public.operator_accounts FOR INSERT TO authenticated
  WITH CHECK (owner_user_id = auth.uid() OR is_super_admin(auth.uid()));

CREATE POLICY "operator_accounts: owner update"
  ON public.operator_accounts FOR UPDATE TO authenticated
  USING (owner_user_id = auth.uid() OR is_super_admin(auth.uid()))
  WITH CHECK (owner_user_id = auth.uid() OR is_super_admin(auth.uid()));

CREATE POLICY "operator_accounts: admin delete"
  ON public.operator_accounts FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER operator_accounts_updated_at
  BEFORE UPDATE ON public.operator_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link locations to an operator account
ALTER TABLE public.ghl_location_tokens
  ADD COLUMN IF NOT EXISTS operator_account_id uuid
    REFERENCES public.operator_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ghl_location_tokens_operator_idx
  ON public.ghl_location_tokens(operator_account_id);

-- Allow super_admin to read all location tokens for admin UI
DROP POLICY IF EXISTS "GHLTokens: admin read all" ON public.ghl_location_tokens;
CREATE POLICY "GHLTokens: admin read all"
  ON public.ghl_location_tokens FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

-- Helper: locations in current active location's operator group
CREATE OR REPLACE FUNCTION public.effective_location_ids(p_location text)
RETURNS text[]
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_location IS NULL THEN ARRAY[]::text[]
    WHEN (SELECT operator_account_id FROM ghl_location_tokens WHERE ghl_location_id = p_location LIMIT 1) IS NULL
      THEN ARRAY[p_location]
    ELSE COALESCE(
      (SELECT array_agg(DISTINCT ghl_location_id)
         FROM ghl_location_tokens
        WHERE operator_account_id = (
          SELECT operator_account_id FROM ghl_location_tokens WHERE ghl_location_id = p_location LIMIT 1
        )
        AND ghl_location_id IS NOT NULL),
      ARRAY[p_location]
    )
  END;
$$;

-- Update consume_credits to honor operator_account billing
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
  v_op_id uuid;
  v_op_sub_active boolean;
  v_op_balance integer;
BEGIN
  SELECT credits INTO v_cost FROM public.credit_action_costs
    WHERE action_key = p_action AND is_active = true;
  IF v_cost IS NULL THEN RETURN false; END IF;

  -- Operator account path
  SELECT operator_account_id INTO v_op_id
    FROM public.ghl_location_tokens
    WHERE ghl_location_id = p_location LIMIT 1;

  IF v_op_id IS NOT NULL THEN
    SELECT (subscription_status = 'active' AND (current_period_end IS NULL OR current_period_end > now())),
           credit_balance
      INTO v_op_sub_active, v_op_balance
      FROM public.operator_accounts WHERE id = v_op_id;

    IF v_op_sub_active THEN
      INSERT INTO public.credit_transactions(ghl_location_id, delta, action_key, related_id, description)
        VALUES (p_location, 0, p_action, p_related_id, 'Operator unlimited: ' || p_action);
      RETURN true;
    END IF;

    UPDATE public.operator_accounts
      SET credit_balance = credit_balance - v_cost, updated_at = now()
      WHERE id = v_op_id AND credit_balance >= v_cost;
    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN RETURN false; END IF;

    INSERT INTO public.credit_transactions(ghl_location_id, delta, action_key, related_id, description)
      VALUES (p_location, -v_cost, p_action, p_related_id,
              'Operator pool: consumed ' || v_cost || ' credit(s) for ' || p_action);
    RETURN true;
  END IF;

  -- Per-location fallback (legacy)
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE ghl_location_id = p_location
      AND subscription_status = 'active'
      AND (current_period_end IS NULL OR current_period_end > now())
  ) INTO v_has_sub;

  IF v_has_sub THEN
    INSERT INTO public.credit_transactions(ghl_location_id, delta, action_key, related_id, description)
      VALUES (p_location, 0, p_action, p_related_id, 'Unlimited subscription: ' || p_action);
    RETURN true;
  END IF;

  UPDATE public.credit_balances
    SET balance = balance - v_cost, updated_at = now()
    WHERE ghl_location_id = p_location AND balance >= v_cost;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN RETURN false; END IF;

  INSERT INTO public.credit_transactions(ghl_location_id, delta, action_key, related_id, description)
    VALUES (p_location, -v_cost, p_action, p_related_id,
            'Consumed ' || v_cost || ' credit(s) for ' || p_action);
  RETURN true;
END;
$function$;
