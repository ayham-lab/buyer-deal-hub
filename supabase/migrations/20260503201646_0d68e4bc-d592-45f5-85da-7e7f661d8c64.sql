
-- Buyer status enum
DO $$ BEGIN
  CREATE TYPE public.buyer_status AS ENUM ('not_vetted','vetted','repeat','recurring');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS first_name text,
  ADD COLUMN IF NOT EXISTS last_name text,
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS buyer_status public.buyer_status NOT NULL DEFAULT 'not_vetted',
  ADD COLUMN IF NOT EXISTS buyer_types text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS buyer_frequency text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS other_property_type text,
  ADD COLUMN IF NOT EXISTS proof_of_funds_files text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS previous_deals text,
  ADD COLUMN IF NOT EXISTS experience text;

-- Backfill first/last name from name
UPDATE public.buyers
SET first_name = COALESCE(first_name, split_part(name,' ',1)),
    last_name = COALESCE(last_name, NULLIF(substring(name from position(' ' in name)+1), ''))
WHERE name IS NOT NULL AND (first_name IS NULL OR last_name IS NULL);

-- Drop tags column
ALTER TABLE public.buyers DROP COLUMN IF EXISTS tags;

-- Trigger: auto-vet when qualifications met
CREATE OR REPLACE FUNCTION public.buyers_auto_vet()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.buyer_status = 'not_vetted'
     AND array_length(NEW.proof_of_funds_files,1) >= 1
     AND NEW.previous_deals IS NOT NULL AND length(trim(NEW.previous_deals)) > 0
     AND NEW.experience IS NOT NULL AND length(trim(NEW.experience)) > 0
  THEN
    NEW.buyer_status := 'vetted';
  END IF;
  -- keep name in sync
  IF NEW.first_name IS NOT NULL OR NEW.last_name IS NOT NULL THEN
    NEW.name := trim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,''));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_buyers_auto_vet ON public.buyers;
CREATE TRIGGER trg_buyers_auto_vet
BEFORE INSERT OR UPDATE ON public.buyers
FOR EACH ROW EXECUTE FUNCTION public.buyers_auto_vet();

-- Storage bucket for proof of funds
INSERT INTO storage.buckets (id, name, public)
VALUES ('buyer-pof','buyer-pof', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "POF: owner read"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'buyer-pof' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "POF: owner insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'buyer-pof' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "POF: owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'buyer-pof' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "POF: owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'buyer-pof' AND auth.uid()::text = (storage.foldername(name))[1]);
