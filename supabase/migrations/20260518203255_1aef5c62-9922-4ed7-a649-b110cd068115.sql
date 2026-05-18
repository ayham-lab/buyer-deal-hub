ALTER TABLE public.ghl_location_tokens
  ADD CONSTRAINT ghl_location_tokens_ghl_location_id_key UNIQUE (ghl_location_id);