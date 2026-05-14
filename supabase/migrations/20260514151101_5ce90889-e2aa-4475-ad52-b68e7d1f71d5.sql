DO $$
DECLARE
  r record;
  v_match_id uuid;
  v_email text;
  v_phone text;
  v_loc text;
BEGIN
  FOR r IN
    SELECT * FROM public.buyers
    WHERE ghl_location_id IS NOT NULL
      AND (NULLIF(trim(email),'') IS NOT NULL OR NULLIF(trim(phone),'') IS NOT NULL)
  LOOP
    v_email := NULLIF(trim(r.email), '');
    v_phone := NULLIF(trim(r.phone), '');
    v_loc   := NULLIF(trim(r.ghl_location_id), '');
    v_match_id := NULL;

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
                THEN coalesce(r.markets, '{}')
              ELSE preferred_markets
            END,
            property_types = CASE
              WHEN coalesce(array_length(property_types,1),0) = 0
                THEN coalesce(r.property_types, '{}')
              ELSE property_types
            END,
            price_min = COALESCE(price_min, r.price_min),
            price_max = COALESCE(price_max, r.price_max),
            updated_at = now()
        WHERE id = v_match_id;
    ELSE
      INSERT INTO public.archive_buyers (
        first_name, last_name, full_name, email, phone,
        preferred_markets, property_types, price_min, price_max,
        sources, is_active
      ) VALUES (
        r.first_name, r.last_name, r.name, v_email, v_phone,
        coalesce(r.markets, '{}'), coalesce(r.property_types, '{}'),
        r.price_min, r.price_max,
        jsonb_build_array(v_loc), true
      );
    END IF;
  END LOOP;
END $$;