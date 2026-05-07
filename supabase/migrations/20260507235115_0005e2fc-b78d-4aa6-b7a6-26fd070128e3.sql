CREATE TABLE IF NOT EXISTS public.ghl_location_tokens (
  ghl_location_id text PRIMARY KEY,
  ghl_company_id text,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ghl_location_tokens ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ghl_opportunity_id text;
CREATE UNIQUE INDEX IF NOT EXISTS deals_ghl_opportunity_id_key
  ON public.deals (ghl_opportunity_id)
  WHERE ghl_opportunity_id IS NOT NULL;