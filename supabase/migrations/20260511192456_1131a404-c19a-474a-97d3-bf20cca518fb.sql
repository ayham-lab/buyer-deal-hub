ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS seller_phone text,
  ADD COLUMN IF NOT EXISTS seller_email text,
  ADD COLUMN IF NOT EXISTS ghl_contact_id text;

ALTER TABLE public.ghl_location_tokens
  ADD COLUMN IF NOT EXISTS location_name text;

CREATE INDEX IF NOT EXISTS deals_ghl_contact_id_idx ON public.deals(ghl_contact_id) WHERE ghl_contact_id IS NOT NULL;