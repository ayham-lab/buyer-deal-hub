DROP TRIGGER IF EXISTS trg_buyers_sync_archive ON public.buyers;
DROP FUNCTION IF EXISTS public.buyers_sync_to_archive() CASCADE;

ALTER TABLE public.archive_buyers
  ADD COLUMN IF NOT EXISTS sources jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS archive_buyers_dedup_email
  ON public.archive_buyers (lower(email))
  WHERE email IS NOT NULL AND email <> '';

CREATE UNIQUE INDEX IF NOT EXISTS archive_buyers_dedup_phone
  ON public.archive_buyers (phone)
  WHERE (email IS NULL OR email = '') AND phone IS NOT NULL AND phone <> '';

CREATE OR REPLACE FUNCTION public.buyers_auto_promote_to_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_match_id uuid;
  v_email text := NULLIF(trim(NEW.email), '');
  v_phone text := NULLIF(trim(NEW.phone), '');
  v_loc   text := NULLIF(trim(NEW.ghl_location_id), '');
BEGIN
  IF v_loc IS NULL THEN RETURN NEW; END IF;
  IF v_email IS NULL AND v_phone IS NULL THEN RETURN NEW; END IF;

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
      SET sources = CASE
            WHEN sources @> to_jsonb(v_loc) THEN sources
            ELSE sources || to_jsonb(v_loc)
          END,
          preferred_markets = CASE
            WHEN coalesce(array_length(preferred_markets,1),0) = 0
              THEN coalesce(NEW.markets, '{}')
            ELSE preferred_markets
          END,
          property_types = CASE
            WHEN coalesce(array_length(property_types,1),0) = 0
              THEN coalesce(NEW.property_types, '{}')
            ELSE property_types
          END,
          price_min = COALESCE(price_min, NEW.price_min),
          price_max = COALESCE(price_max, NEW.price_max),
          updated_at = now()
      WHERE id = v_match_id;
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
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.buyers_auto_promote_to_archive() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS buyers_auto_promote_to_archive_trg ON public.buyers;
CREATE TRIGGER buyers_auto_promote_to_archive_trg
AFTER INSERT OR UPDATE OF email, phone, name, first_name, last_name, markets, property_types, price_min, price_max, ghl_location_id
ON public.buyers
FOR EACH ROW
EXECUTE FUNCTION public.buyers_auto_promote_to_archive();