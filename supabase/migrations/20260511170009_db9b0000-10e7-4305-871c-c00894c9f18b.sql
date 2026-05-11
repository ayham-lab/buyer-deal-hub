ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_number text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_number_us_format;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_number_us_format
  CHECK (phone_number IS NULL OR phone_number ~ '^\+1\d{10}$');