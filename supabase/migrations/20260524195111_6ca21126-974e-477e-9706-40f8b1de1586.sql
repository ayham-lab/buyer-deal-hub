
DO $$ BEGIN
  CREATE TYPE public.buyer_activity AS ENUM ('currently_buying', 'inactive', 'not_buying_now', 'uncertain');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.buyers
  ADD COLUMN IF NOT EXISTS buyer_activity public.buyer_activity NOT NULL DEFAULT 'currently_buying',
  ADD COLUMN IF NOT EXISTS activity_resume_date date;

ALTER TABLE public.archive_buyers
  ADD COLUMN IF NOT EXISTS buyer_activity public.buyer_activity NOT NULL DEFAULT 'currently_buying',
  ADD COLUMN IF NOT EXISTS activity_resume_date date;
