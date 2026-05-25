
-- Replace broad SELECT policies with super_admin-only direct reads.
DROP POLICY IF EXISTS "archive_buyers: read for authenticated" ON public.archive_buyers;
CREATE POLICY "archive_buyers: super_admin read"
ON public.archive_buyers
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "archive_title_companies: read for authenticated" ON public.archive_title_companies;
CREATE POLICY "archive_title_companies: super_admin read"
ON public.archive_title_companies
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

-- RPC: number of archive-tracked completed deals for a buyer (used in buyer drawer).
CREATE OR REPLACE FUNCTION public.get_archive_buyer_system_deals(p_email text, p_phone text)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT system_deals_purchased
    FROM public.archive_buyers
    WHERE (
      (p_email IS NOT NULL AND length(trim(p_email)) > 0 AND lower(email) = lower(trim(p_email)))
      OR (
        (p_email IS NULL OR length(trim(p_email)) = 0)
        AND p_phone IS NOT NULL AND length(trim(p_phone)) > 0
        AND phone = trim(p_phone)
      )
    )
    ORDER BY created_at ASC
    LIMIT 1
  ), 0);
$$;
REVOKE ALL ON FUNCTION public.get_archive_buyer_system_deals(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_archive_buyer_system_deals(text, text) TO authenticated;

-- RPC: return revealed buyer contact, only if the caller's location already paid to reveal them.
CREATE OR REPLACE FUNCTION public.get_archive_buyer_contact(p_location text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revealed boolean;
  v_email text;
  v_phone text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;
  IF p_location IS NULL OR p_id IS NULL THEN
    RETURN jsonb_build_object('error', 'missing_params');
  END IF;

  -- Confirm caller has access to this location (membership) OR is admin.
  IF NOT (
    public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
    OR public.is_location_member(auth.uid(), p_location)
  ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.archive_buyer_reveals
    WHERE ghl_location_id = p_location AND buyer_id = p_id
  ) INTO v_revealed;

  IF NOT v_revealed AND NOT (public.is_admin(auth.uid()) OR public.is_super_admin(auth.uid())) THEN
    RETURN jsonb_build_object('error', 'not_revealed');
  END IF;

  SELECT email, phone INTO v_email, v_phone
  FROM public.archive_buyers WHERE id = p_id;

  RETURN jsonb_build_object('email', v_email, 'phone', v_phone);
END;
$$;
REVOKE ALL ON FUNCTION public.get_archive_buyer_contact(text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_archive_buyer_contact(text, uuid) TO authenticated;
