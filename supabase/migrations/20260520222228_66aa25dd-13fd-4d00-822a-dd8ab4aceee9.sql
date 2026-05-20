CREATE OR REPLACE FUNCTION public._sync_archive_from_buyers(p_archive_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_email text; v_phone text;
  v_sum int := 0;
  v_best public.buyer_status := NULL;
  v_override boolean := false;
BEGIN
  SELECT email, phone, status_override_by_admin
    INTO v_email, v_phone, v_override
    FROM public.archive_buyers WHERE id = p_archive_id;
  IF NOT FOUND THEN RETURN; END IF;

  WITH matches AS (
    SELECT deals_purchased, buyer_status FROM public.buyers
    WHERE (v_email IS NOT NULL AND email IS NOT NULL AND lower(email) = lower(v_email))
       OR (v_email IS NULL AND v_phone IS NOT NULL AND phone = v_phone)
  )
  SELECT COALESCE(SUM(deals_purchased),0),
         (SELECT buyer_status FROM matches
           ORDER BY public._buyer_status_rank(buyer_status) DESC NULLS LAST
           LIMIT 1)
    INTO v_sum, v_best
    FROM matches;

  IF v_override THEN
    UPDATE public.archive_buyers
      SET system_deals_purchased = v_sum, updated_at = now()
      WHERE id = p_archive_id;
  ELSIF v_best IS NOT NULL THEN
    UPDATE public.archive_buyers
      SET system_deals_purchased = v_sum,
          status = v_best,
          updated_at = now()
      WHERE id = p_archive_id;
  ELSE
    -- No operator matches: preserve existing status, only update sum
    UPDATE public.archive_buyers
      SET system_deals_purchased = v_sum, updated_at = now()
      WHERE id = p_archive_id;
  END IF;
END $function$;