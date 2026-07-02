
ALTER TABLE public.ghl_location_tokens
  ADD COLUMN IF NOT EXISTS god_mode boolean NOT NULL DEFAULT false;

-- Update consume_credits: if location has god_mode, log a zero-delta transaction and succeed
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
  v_god boolean;
BEGIN
  SELECT credits INTO v_cost FROM public.credit_action_costs
    WHERE action_key = p_action AND is_active = true;
  IF v_cost IS NULL THEN RETURN false; END IF;

  -- God mode short-circuit: unlimited, free
  SELECT god_mode, operator_account_id
    INTO v_god, v_op_id
    FROM public.ghl_location_tokens
    WHERE ghl_location_id = p_location LIMIT 1;

  IF COALESCE(v_god, false) THEN
    INSERT INTO public.credit_transactions(ghl_location_id, delta, action_key, related_id, description)
      VALUES (p_location, 0, p_action, p_related_id, 'God mode: ' || p_action);
    RETURN true;
  END IF;

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

  -- Per-location fallback
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

-- Admin-only setter
CREATE OR REPLACE FUNCTION public.set_location_god_mode(p_location text, p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RETURN false;
  END IF;
  UPDATE public.ghl_location_tokens
    SET god_mode = COALESCE(p_enabled, false), updated_at = now()
    WHERE ghl_location_id = p_location;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.set_location_god_mode(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_location_god_mode(text, boolean) TO authenticated, service_role;

-- Admin-readable listing of locations with god_mode + basic info
CREATE OR REPLACE FUNCTION public.admin_list_locations()
RETURNS TABLE(
  ghl_location_id text,
  location_name text,
  god_mode boolean,
  archive_contributions_enabled boolean,
  operator_account_id uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT t.ghl_location_id, t.location_name, t.god_mode,
         t.archive_contributions_enabled, t.operator_account_id,
         t.created_at, t.updated_at
  FROM public.ghl_location_tokens t
  WHERE public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid())
  ORDER BY t.location_name NULLS LAST, t.ghl_location_id;
$$;

REVOKE ALL ON FUNCTION public.admin_list_locations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_locations() TO authenticated, service_role;
