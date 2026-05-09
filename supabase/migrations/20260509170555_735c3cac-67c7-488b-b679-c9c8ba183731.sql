ALTER TABLE public.ghl_location_tokens ADD COLUMN IF NOT EXISTS id uuid NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.ghl_location_tokens DROP CONSTRAINT IF EXISTS ghl_location_tokens_pkey;

ALTER TABLE public.ghl_location_tokens ADD PRIMARY KEY (id);

ALTER TABLE public.ghl_location_tokens ALTER COLUMN ghl_location_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ghl_location_tokens_location_uniq
  ON public.ghl_location_tokens(ghl_location_id)
  WHERE ghl_location_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ghl_location_tokens_company_only_uniq
  ON public.ghl_location_tokens(ghl_company_id)
  WHERE ghl_location_id IS NULL;