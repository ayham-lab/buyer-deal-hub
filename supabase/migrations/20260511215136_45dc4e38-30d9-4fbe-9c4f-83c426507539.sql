CREATE OR REPLACE FUNCTION public.enforce_mapped_ghl_deal_stage()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Only enforce for GHL-imported deals. Manual deals are unaffected.
  IF NEW.ghl_opportunity_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.ghl_location_id IS NULL OR NEW.ghl_pipeline_stage_id IS NULL THEN
    RAISE EXCEPTION 'GHL imported deals require an explicit mapped location and stage';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.ghl_dispo_stage_mappings m
    WHERE m.ghl_location_id = NEW.ghl_location_id
      AND m.ghl_stage_id = NEW.ghl_pipeline_stage_id
  ) THEN
    RAISE EXCEPTION 'GHL imported deal stage is not mapped for Dispo sync';
  END IF;

  RETURN NEW;
END;
$$;