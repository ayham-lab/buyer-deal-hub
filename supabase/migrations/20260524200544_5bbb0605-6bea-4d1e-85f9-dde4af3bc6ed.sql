
ALTER TABLE public.ghl_location_tokens
  ADD COLUMN IF NOT EXISTS archive_contributions_enabled boolean NOT NULL DEFAULT true;

-- Hide from operators: revoke client UPDATE on this column happens via RLS (existing policies already deny UPDATE to authenticated). Only super_admin via service role can toggle it.

CREATE OR REPLACE FUNCTION public.buyers_auto_promote_to_archive()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_match_id uuid;
  v_email text := NULLIF(trim(NEW.email), '');
  v_phone text := NULLIF(trim(NEW.phone), '');
  v_loc   text := NULLIF(trim(NEW.ghl_location_id), '');
  v_enabled boolean;
BEGIN
  IF v_loc IS NULL THEN RETURN NEW; END IF;
  IF v_email IS NULL AND v_phone IS NULL THEN RETURN NEW; END IF;

  -- Honor hidden per-location archive contribution flag
  SELECT archive_contributions_enabled INTO v_enabled
    FROM public.ghl_location_tokens
    WHERE ghl_location_id = v_loc LIMIT 1;
  IF v_enabled IS NOT NULL AND v_enabled = false THEN
    RETURN NEW;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_match_id FROM public.archive_buyers
      WHERE lower(email) = lower(v_email) LIMIT 1;
  END IF;
  IF v_match_id IS NULL AND v_phone IS NOT NULL THEN
    SELECT id INTO v_match_id FROM public.archive_buyers
      WHERE phone = v_phone AND (email IS NULL OR email = '') LIMIT 1;
  END IF;

  IF v_match_id IS NOT NULL THEN
    UPDATE public.archive_buyers
      SET sources = CASE WHEN sources @> to_jsonb(v_loc) THEN sources ELSE sources || to_jsonb(v_loc) END,
          preferred_markets = CASE
            WHEN coalesce(array_length(NEW.markets,1),0) > 0 THEN NEW.markets
            ELSE preferred_markets
          END,
          property_types = CASE
            WHEN coalesce(array_length(NEW.property_types,1),0) > 0 THEN NEW.property_types
            ELSE property_types
          END,
          price_min = COALESCE(NEW.price_min, price_min),
          price_max = COALESCE(NEW.price_max, price_max),
          updated_at = now()
      WHERE id = v_match_id;
    PERFORM public.normalize_archive_buyer_markets(v_match_id);
  ELSE
    INSERT INTO public.archive_buyers (
      first_name, last_name, full_name, email, phone,
      preferred_markets, property_types, price_min, price_max,
      sources, is_active
    ) VALUES (
      NEW.first_name, NEW.last_name, NEW.name, v_email, v_phone,
      coalesce(NEW.markets, '{}'), coalesce(NEW.property_types, '{}'),
      NEW.price_min, NEW.price_max,
      jsonb_build_array(v_loc), true
    ) RETURNING id INTO v_match_id;
    PERFORM public.normalize_archive_buyer_markets(v_match_id);
  END IF;

  RETURN NEW;
END;
$function$;

-- Admin-only RPC to toggle the flag (hidden from operators)
CREATE OR REPLACE FUNCTION public.set_location_archive_contributions(p_location text, p_enabled boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RETURN false;
  END IF;
  UPDATE public.ghl_location_tokens
    SET archive_contributions_enabled = COALESCE(p_enabled, true),
        updated_at = now()
    WHERE ghl_location_id = p_location;
  RETURN FOUND;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.set_location_archive_contributions(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_location_archive_contributions(text, boolean) TO authenticated;
