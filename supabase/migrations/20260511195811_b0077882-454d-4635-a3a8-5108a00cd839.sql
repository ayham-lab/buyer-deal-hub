ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS ghl_pipeline_stage_id text;
CREATE INDEX IF NOT EXISTS idx_deals_loc_stage ON public.deals (ghl_location_id, ghl_pipeline_stage_id);