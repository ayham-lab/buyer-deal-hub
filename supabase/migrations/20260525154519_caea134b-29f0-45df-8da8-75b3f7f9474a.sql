
-- 1) Public marketing deals: remove broad anon SELECT, expose via a definer RPC with only safe columns
DROP POLICY IF EXISTS "Deals: public marketing read" ON public.deals;

CREATE OR REPLACE FUNCTION public.get_public_marketing_deal(p_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_jsonb(d) - 'seller_email' - 'seller_phone' - 'seller_name' - 'homeowner_name'
                    - 'contract_price' - 'price_under_contract' - 'minimum_sale_price'
                    - 'ghl_opportunity_id' - 'ghl_pipeline_id' - 'ghl_pipeline_stage_id'
                    - 'ghl_location_id' - 'user_id' - 'deleted_by' - 'lead_source'
                    - 'created_by' - 'assigned_to'
  FROM public.deals d
  WHERE d.id = p_id
    AND d.marketing_published = true
    AND d.deleted_at IS NULL;
$$;

REVOKE ALL ON FUNCTION public.get_public_marketing_deal(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_marketing_deal(uuid) TO anon, authenticated;

-- 2) Restrict OAuth tokens — never expose access_token / refresh_token to client roles.
--    Edge functions use service_role and bypass column grants.
REVOKE SELECT (access_token, refresh_token) ON public.ghl_location_tokens FROM anon, authenticated;

-- 3) Tighten oauth_install_log: NULL-location branch should only grant access to admins/super_admins.
DROP POLICY IF EXISTS "oauth_install_log: scoped auth read" ON public.oauth_install_log;
CREATE POLICY "oauth_install_log: scoped auth read"
ON public.oauth_install_log
FOR SELECT
TO authenticated
USING (
  ((current_ghl_location() IS NULL) AND (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid())))
  OR (location_id = current_ghl_location())
);

-- 4) Add search_path to the two helper functions missing it (linter warning).
CREATE OR REPLACE FUNCTION public._state_abbr_to_full(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public._state_full_to_abbr(p text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path = public
AS $function$
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
$function$;
