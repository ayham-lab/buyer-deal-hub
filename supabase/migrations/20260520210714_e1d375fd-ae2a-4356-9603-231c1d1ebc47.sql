
-- PART 1: deals_purchased counter
ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS deals_purchased int NOT NULL DEFAULT 0
    CHECK (deals_purchased >= 0 AND deals_purchased <= 999);

ALTER TABLE public.archive_buyers
  ADD COLUMN IF NOT EXISTS system_deals_purchased int NOT NULL DEFAULT 0;

-- PART 2: unified status on archive_buyers + override flag
ALTER TABLE public.archive_buyers
  ADD COLUMN IF NOT EXISTS status public.buyer_status NULL,
  ADD COLUMN IF NOT EXISTS status_override_by_admin boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.archive_buyers.quality_tier IS
  'DEPRECATED: use archive_buyers.status instead. Retained for the legacy CSV import path only.';

-- Backfill status from quality_tier
UPDATE public.archive_buyers
  SET status = CASE lower(coalesce(quality_tier,''))
    WHEN 'vip buyer'        THEN 'vetted_and_closed'::public.buyer_status
    WHEN 'vetted'           THEN 'vetted'::public.buyer_status
    WHEN 'experienced'      THEN 'vetted'::public.buyer_status
    WHEN 'purchased a deal' THEN 'repeat'::public.buyer_status
    ELSE NULL
  END
  WHERE status IS NULL AND quality_tier IS NOT NULL;

-- Precedence rank for buyer_status
CREATE OR REPLACE FUNCTION public._buyer_status_rank(s public.buyer_status)
RETURNS int LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE s
    WHEN 'vetted_and_closed' THEN 4
    WHEN 'vetted'            THEN 3
    WHEN 'repeat'            THEN 2
    WHEN 'recurring'         THEN 1
    WHEN 'not_vetted'        THEN 0
    ELSE 0
  END;
$$;

-- Recompute system_deals_purchased + status for one archive row
CREATE OR REPLACE FUNCTION public._sync_archive_from_buyers(p_archive_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
  ELSE
    UPDATE public.archive_buyers
      SET system_deals_purchased = v_sum,
          status = v_best,
          updated_at = now()
      WHERE id = p_archive_id;
  END IF;
END $$;

-- Find matching archive id for a buyers row (email-first, phone fallback)
CREATE OR REPLACE FUNCTION public._find_archive_for_buyer(p_email text, p_phone text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_email IS NOT NULL AND length(trim(p_email)) > 0 THEN
    SELECT id INTO v_id FROM public.archive_buyers
      WHERE lower(email) = lower(p_email)
      ORDER BY created_at LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
  END IF;
  IF p_phone IS NOT NULL AND length(trim(p_phone)) > 0 THEN
    SELECT id INTO v_id FROM public.archive_buyers
      WHERE phone = p_phone AND (email IS NULL OR email = '')
      ORDER BY created_at LIMIT 1;
  END IF;
  RETURN v_id;
END $$;

-- Trigger function on buyers
CREATE OR REPLACE FUNCTION public.buyers_sync_to_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_arch_id uuid; v_old_arch_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old_arch_id := public._find_archive_for_buyer(OLD.email, OLD.phone);
    IF v_old_arch_id IS NOT NULL THEN
      PERFORM public._sync_archive_from_buyers(v_old_arch_id);
    END IF;
    RETURN OLD;
  END IF;

  v_arch_id := public._find_archive_for_buyer(NEW.email, NEW.phone);
  IF v_arch_id IS NOT NULL THEN
    PERFORM public._sync_archive_from_buyers(v_arch_id);
  END IF;

  IF TG_OP = 'UPDATE' AND (OLD.email IS DISTINCT FROM NEW.email OR OLD.phone IS DISTINCT FROM NEW.phone) THEN
    v_old_arch_id := public._find_archive_for_buyer(OLD.email, OLD.phone);
    IF v_old_arch_id IS NOT NULL AND v_old_arch_id IS DISTINCT FROM v_arch_id THEN
      PERFORM public._sync_archive_from_buyers(v_old_arch_id);
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_buyers_sync_archive ON public.buyers;
CREATE TRIGGER trg_buyers_sync_archive
  AFTER INSERT OR DELETE OR UPDATE OF deals_purchased, buyer_status, email, phone
  ON public.buyers
  FOR EACH ROW EXECUTE FUNCTION public.buyers_sync_to_archive();

-- Initial backfill: recompute every archive row's system count + status
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.archive_buyers LOOP
    PERFORM public._sync_archive_from_buyers(r.id);
  END LOOP;
END $$;

-- Super-admin RPC: set archive status (turns on override)
CREATE OR REPLACE FUNCTION public.set_archive_buyer_status(p_id uuid, p_status public.buyer_status)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RETURN false; END IF;
  UPDATE public.archive_buyers
    SET status = p_status,
        status_override_by_admin = true,
        updated_at = now()
    WHERE id = p_id;
  RETURN FOUND;
END $$;

-- Super-admin RPC: clear override (re-runs auto-sync)
CREATE OR REPLACE FUNCTION public.clear_archive_buyer_status_override(p_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN RETURN false; END IF;
  UPDATE public.archive_buyers
    SET status_override_by_admin = false
    WHERE id = p_id;
  PERFORM public._sync_archive_from_buyers(p_id);
  RETURN FOUND;
END $$;
