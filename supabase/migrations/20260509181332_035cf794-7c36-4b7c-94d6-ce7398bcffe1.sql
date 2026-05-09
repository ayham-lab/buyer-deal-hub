CREATE OR REPLACE FUNCTION public.current_ghl_location()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  loc text;
  is_iframe text;
BEGIN
  loc := NULLIF(current_setting('request.headers', true)::json ->> 'x-ghl-location-id', '');
  is_iframe := NULLIF(current_setting('request.headers', true)::json ->> 'x-ghl-iframe', '');
  IF is_iframe IS NOT NULL AND is_iframe IN ('1','true','yes') AND loc IS NULL THEN
    RAISE EXCEPTION 'Tenant scope missing: x-ghl-iframe header set but x-ghl-location-id empty.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN loc;
END;
$$;
