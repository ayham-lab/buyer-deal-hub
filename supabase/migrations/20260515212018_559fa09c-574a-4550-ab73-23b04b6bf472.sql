
-- US state map for normalization
CREATE OR REPLACE FUNCTION public._state_full_to_abbr(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(trim(p))
    WHEN 'alabama' THEN 'AL' WHEN 'alaska' THEN 'AK' WHEN 'arizona' THEN 'AZ' WHEN 'arkansas' THEN 'AR'
    WHEN 'california' THEN 'CA' WHEN 'colorado' THEN 'CO' WHEN 'connecticut' THEN 'CT' WHEN 'delaware' THEN 'DE'
    WHEN 'district of columbia' THEN 'DC' WHEN 'florida' THEN 'FL' WHEN 'georgia' THEN 'GA' WHEN 'hawaii' THEN 'HI'
    WHEN 'idaho' THEN 'ID' WHEN 'illinois' THEN 'IL' WHEN 'indiana' THEN 'IN' WHEN 'iowa' THEN 'IA'
    WHEN 'kansas' THEN 'KS' WHEN 'kentucky' THEN 'KY' WHEN 'louisiana' THEN 'LA' WHEN 'maine' THEN 'ME'
    WHEN 'maryland' THEN 'MD' WHEN 'massachusetts' THEN 'MA' WHEN 'michigan' THEN 'MI' WHEN 'minnesota' THEN 'MN'
    WHEN 'mississippi' THEN 'MS' WHEN 'missouri' THEN 'MO' WHEN 'montana' THEN 'MT' WHEN 'nebraska' THEN 'NE'
    WHEN 'nevada' THEN 'NV' WHEN 'new hampshire' THEN 'NH' WHEN 'new jersey' THEN 'NJ' WHEN 'new mexico' THEN 'NM'
    WHEN 'new york' THEN 'NY' WHEN 'north carolina' THEN 'NC' WHEN 'north dakota' THEN 'ND' WHEN 'ohio' THEN 'OH'
    WHEN 'oklahoma' THEN 'OK' WHEN 'oregon' THEN 'OR' WHEN 'pennsylvania' THEN 'PA' WHEN 'rhode island' THEN 'RI'
    WHEN 'south carolina' THEN 'SC' WHEN 'south dakota' THEN 'SD' WHEN 'tennessee' THEN 'TN' WHEN 'texas' THEN 'TX'
    WHEN 'utah' THEN 'UT' WHEN 'vermont' THEN 'VT' WHEN 'virginia' THEN 'VA' WHEN 'washington' THEN 'WA'
    WHEN 'west virginia' THEN 'WV' WHEN 'wisconsin' THEN 'WI' WHEN 'wyoming' THEN 'WY'
    ELSE NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public._state_abbr_to_full(p text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE upper(trim(p))
    WHEN 'AL' THEN 'Alabama' WHEN 'AK' THEN 'Alaska' WHEN 'AZ' THEN 'Arizona' WHEN 'AR' THEN 'Arkansas'
    WHEN 'CA' THEN 'California' WHEN 'CO' THEN 'Colorado' WHEN 'CT' THEN 'Connecticut' WHEN 'DE' THEN 'Delaware'
    WHEN 'DC' THEN 'District of Columbia' WHEN 'FL' THEN 'Florida' WHEN 'GA' THEN 'Georgia' WHEN 'HI' THEN 'Hawaii'
    WHEN 'ID' THEN 'Idaho' WHEN 'IL' THEN 'Illinois' WHEN 'IN' THEN 'Indiana' WHEN 'IA' THEN 'Iowa'
    WHEN 'KS' THEN 'Kansas' WHEN 'KY' THEN 'Kentucky' WHEN 'LA' THEN 'Louisiana' WHEN 'ME' THEN 'Maine'
    WHEN 'MD' THEN 'Maryland' WHEN 'MA' THEN 'Massachusetts' WHEN 'MI' THEN 'Michigan' WHEN 'MN' THEN 'Minnesota'
    WHEN 'MS' THEN 'Mississippi' WHEN 'MO' THEN 'Missouri' WHEN 'MT' THEN 'Montana' WHEN 'NE' THEN 'Nebraska'
    WHEN 'NV' THEN 'Nevada' WHEN 'NH' THEN 'New Hampshire' WHEN 'NJ' THEN 'New Jersey' WHEN 'NM' THEN 'New Mexico'
    WHEN 'NY' THEN 'New York' WHEN 'NC' THEN 'North Carolina' WHEN 'ND' THEN 'North Dakota' WHEN 'OH' THEN 'Ohio'
    WHEN 'OK' THEN 'Oklahoma' WHEN 'OR' THEN 'Oregon' WHEN 'PA' THEN 'Pennsylvania' WHEN 'RI' THEN 'Rhode Island'
    WHEN 'SC' THEN 'South Carolina' WHEN 'SD' THEN 'South Dakota' WHEN 'TN' THEN 'Tennessee' WHEN 'TX' THEN 'Texas'
    WHEN 'UT' THEN 'Utah' WHEN 'VT' THEN 'Vermont' WHEN 'VA' THEN 'Virginia' WHEN 'WA' THEN 'Washington'
    WHEN 'WV' THEN 'West Virginia' WHEN 'WI' THEN 'Wisconsin' WHEN 'WY' THEN 'Wyoming'
    ELSE NULL
  END;
$$;

-- Idempotent normalizer: parses prefixed market tags and emits city/state + normalized tokens
CREATE OR REPLACE FUNCTION public.normalize_archive_buyer_markets(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
  m text;
  tokens text[] := '{}';
  parsed_city text;
  parsed_state text;
  body text;
  parts text[];
  state_part text;
  state_abbr text;
  state_full text;
  rest text;
BEGIN
  SELECT id, city, state, preferred_markets, national INTO r FROM archive_buyers WHERE id = p_id;
  IF NOT FOUND THEN RETURN; END IF;

  FOREACH m IN ARRAY coalesce(r.preferred_markets, '{}') LOOP
    IF m IS NULL OR trim(m) = '' THEN CONTINUE; END IF;
    -- always keep original (lowercased) for backward compat
    tokens := tokens || lower(trim(m));

    -- Parse prefixed tags like "City:Philadelphia, PA", "State:NJ", "County:Bucks, PA"
    IF m ~* '^(City|County|Zip)\s*:' THEN
      body := trim(regexp_replace(m, '^(City|County|Zip)\s*:\s*', '', 'i'));
      parts := regexp_split_to_array(body, '\s*,\s*');
      IF array_length(parts,1) >= 2 THEN
        rest := parts[1];
        state_part := parts[array_length(parts,1)];
      ELSE
        rest := body; state_part := NULL;
      END IF;

      IF lower(m) LIKE 'city:%' AND parsed_city IS NULL THEN
        parsed_city := initcap(rest);
        tokens := tokens || lower(rest);
      END IF;

      IF state_part IS NOT NULL THEN
        IF length(state_part) = 2 THEN
          state_abbr := upper(state_part);
          state_full := public._state_abbr_to_full(state_abbr);
        ELSE
          state_full := initcap(state_part);
          state_abbr := public._state_full_to_abbr(state_part);
        END IF;
        IF state_full IS NOT NULL AND parsed_state IS NULL THEN parsed_state := state_full; END IF;
        IF state_abbr IS NOT NULL THEN tokens := tokens || lower(state_abbr); END IF;
        IF state_full IS NOT NULL THEN tokens := tokens || lower(state_full); END IF;
      END IF;

      IF rest IS NOT NULL AND state_part IS NOT NULL THEN
        tokens := tokens || (lower(rest) || ', ' || lower(coalesce(state_abbr, state_part)));
      END IF;

    ELSIF m ~* '^State\s*:' THEN
      body := trim(regexp_replace(m, '^State\s*:\s*', '', 'i'));
      IF length(body) = 2 THEN
        state_abbr := upper(body); state_full := public._state_abbr_to_full(state_abbr);
      ELSE
        state_full := initcap(body); state_abbr := public._state_full_to_abbr(body);
      END IF;
      IF state_full IS NOT NULL AND parsed_state IS NULL THEN parsed_state := state_full; END IF;
      IF state_abbr IS NOT NULL THEN tokens := tokens || lower(state_abbr); END IF;
      IF state_full IS NOT NULL THEN tokens := tokens || lower(state_full); END IF;
    END IF;
  END LOOP;

  -- Dedup tokens
  tokens := ARRAY(SELECT DISTINCT t FROM unnest(tokens) AS t WHERE t IS NOT NULL AND trim(t) <> '');

  UPDATE archive_buyers SET
    city = COALESCE(NULLIF(city,''), parsed_city),
    state = COALESCE(NULLIF(state,''), parsed_state),
    preferred_markets = tokens,
    updated_at = now()
  WHERE id = p_id;
END;
$$;

-- Backfill all existing rows
DO $$
DECLARE rid uuid;
BEGIN
  FOR rid IN SELECT id FROM archive_buyers LOOP
    PERFORM public.normalize_archive_buyer_markets(rid);
  END LOOP;
END $$;

-- Update auto-promote trigger to call normalizer after insert/update
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
