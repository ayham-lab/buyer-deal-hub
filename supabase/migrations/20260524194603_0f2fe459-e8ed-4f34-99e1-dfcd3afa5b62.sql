
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS beds numeric,
  ADD COLUMN IF NOT EXISTS baths numeric,
  ADD COLUMN IF NOT EXISTS living_sqft numeric,
  ADD COLUMN IF NOT EXISTS lot_size text,
  ADD COLUMN IF NOT EXISTS year_built integer,
  ADD COLUMN IF NOT EXISTS property_type text,
  ADD COLUMN IF NOT EXISTS occupancy text,
  ADD COLUMN IF NOT EXISTS access text,
  ADD COLUMN IF NOT EXISTS rehab_level text,
  ADD COLUMN IF NOT EXISTS roof_age text,
  ADD COLUMN IF NOT EXISTS plumbing_age text,
  ADD COLUMN IF NOT EXISTS electrical_age text,
  ADD COLUMN IF NOT EXISTS ac_age text,
  ADD COLUMN IF NOT EXISTS water_heater_age text,
  ADD COLUMN IF NOT EXISTS hvac_age text,
  ADD COLUMN IF NOT EXISTS sold_comps text,
  ADD COLUMN IF NOT EXISTS non_refundable_emd numeric;
