CREATE UNIQUE INDEX IF NOT EXISTS deals_ghl_opportunity_id_key
ON public.deals (ghl_opportunity_id)
WHERE ghl_opportunity_id IS NOT NULL;