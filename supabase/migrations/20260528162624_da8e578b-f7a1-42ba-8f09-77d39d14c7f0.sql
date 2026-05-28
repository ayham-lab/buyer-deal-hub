
ALTER TABLE public.skiptrace_buyers
  ADD COLUMN IF NOT EXISTS owner2_first text,
  ADD COLUMN IF NOT EXISTS owner2_last text,
  ADD COLUMN IF NOT EXISTS property_county text,
  ADD COLUMN IF NOT EXISTS email3 text;
