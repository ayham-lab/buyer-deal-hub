ALTER TABLE public.archive_buyers
  ADD COLUMN IF NOT EXISTS quality_tier text,
  ADD COLUMN IF NOT EXISTS last_outcome text,
  ADD COLUMN IF NOT EXISTS budget_notes text,
  ADD COLUMN IF NOT EXISTS exit_strategy text,
  ADD COLUMN IF NOT EXISTS preferred_zips jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS phone_2 text,
  ADD COLUMN IF NOT EXISTS completed_transaction boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS national boolean NOT NULL DEFAULT false;