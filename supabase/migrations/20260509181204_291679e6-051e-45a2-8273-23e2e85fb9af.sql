-- Belt-and-suspenders: when the client declares it is running inside the GHL
-- iframe (via the x-ghl-iframe: 1 request header) but forgot to also send
-- x-ghl-location-id, refuse to answer the query at all. This makes it
-- impossible for a buggy client to fall back to the agency-owner
-- "see everything" path while pretending to be in iframe mode.

CREATE OR REPLACE FUNCTION public.current_ghl_location()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  loc text;
  is_iframe text;
BEGIN
  loc := NULLIF(
    current_setting('request.headers', true)::json ->> 'x-ghl-location-id',
    ''
  );
  is_iframe := NULLIF(
    current_setting('request.headers', true)::json ->> 'x-ghl-iframe',
    ''
  );

  IF is_iframe IS NOT NULL AND is_iframe IN ('1','true','yes')
     AND loc IS NULL THEN
    RAISE EXCEPTION
      'Tenant scope missing: x-ghl-iframe header is set but x-ghl-location-id is empty. Refusing to run query.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN loc;
END;
$$;
