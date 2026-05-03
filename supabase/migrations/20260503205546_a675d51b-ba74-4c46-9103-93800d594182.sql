
-- Trigger function: mirror new buyers into buyer_archive
CREATE OR REPLACE FUNCTION public.buyers_sync_to_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.buyer_archive (
    name, email, phone, markets, property_types,
    price_min, price_max, source, added_by_user_id, is_shared
  ) VALUES (
    NEW.name, NEW.email, NEW.phone,
    COALESCE(NEW.markets, '{}'),
    COALESCE(NEW.property_types, '{}'),
    NEW.price_min, NEW.price_max,
    COALESCE(NEW.source, 'rolodex'),
    NEW.user_id, true
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_buyers_sync_archive ON public.buyers;
CREATE TRIGGER trg_buyers_sync_archive
AFTER INSERT ON public.buyers
FOR EACH ROW
EXECUTE FUNCTION public.buyers_sync_to_archive();

-- Backfill existing buyers not yet in archive (match by name + email + added_by_user_id)
INSERT INTO public.buyer_archive (
  name, email, phone, markets, property_types,
  price_min, price_max, source, added_by_user_id, is_shared
)
SELECT b.name, b.email, b.phone,
       COALESCE(b.markets,'{}'), COALESCE(b.property_types,'{}'),
       b.price_min, b.price_max, COALESCE(b.source,'rolodex'),
       b.user_id, true
FROM public.buyers b
WHERE NOT EXISTS (
  SELECT 1 FROM public.buyer_archive a
  WHERE a.added_by_user_id = b.user_id
    AND a.name = b.name
    AND COALESCE(a.email,'') = COALESCE(b.email,'')
);
