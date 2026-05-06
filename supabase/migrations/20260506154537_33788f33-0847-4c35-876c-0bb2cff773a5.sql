-- =========================================================
-- UP
-- =========================================================

-- 1. Add new columns (nullable first for safe backfill)
ALTER TABLE public.ghl_location_links
  ADD COLUMN IF NOT EXISTS user_id uuid,
  ADD COLUMN IF NOT EXISTS ghl_company_id text;

-- 2. Backfill user_id for any pre-existing rows from linked_by_user_id
UPDATE public.ghl_location_links
SET user_id = linked_by_user_id
WHERE user_id IS NULL;

-- 3. Drop the over-restrictive unique on ghl_location_id alone
ALTER TABLE public.ghl_location_links
  DROP CONSTRAINT IF EXISTS ghl_location_links_ghl_location_id_key;

-- 4. Add the correct composite unique (member, location)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ghl_location_links_user_loc_key'
  ) THEN
    ALTER TABLE public.ghl_location_links
      ADD CONSTRAINT ghl_location_links_user_loc_key UNIQUE (user_id, ghl_location_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_ghl_links_user ON public.ghl_location_links(user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_links_location ON public.ghl_location_links(ghl_location_id);

-- 5. Backfill membership rows from existing profiles.ghl_location_id (idempotent)
INSERT INTO public.ghl_location_links
  (user_id, workspace_owner_user_id, linked_by_user_id, ghl_location_id)
SELECT
  p.user_id,
  p.user_id,         -- they become their own workspace owner (no prior tenancy data)
  p.user_id,
  p.ghl_location_id
FROM public.profiles p
WHERE p.ghl_location_id IS NOT NULL
  AND length(trim(p.ghl_location_id)) > 0
ON CONFLICT (user_id, ghl_location_id) DO NOTHING;

-- 6. Now enforce NOT NULL on user_id
ALTER TABLE public.ghl_location_links
  ALTER COLUMN user_id SET NOT NULL;

-- 7. Additive RLS policies (do NOT drop existing policies)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ghl_location_links' AND policyname='GHLLinks: member select') THEN
    CREATE POLICY "GHLLinks: member select"
      ON public.ghl_location_links
      FOR SELECT TO authenticated
      USING (user_id = auth.uid());
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ghl_location_links' AND policyname='GHLLinks: self insert') THEN
    CREATE POLICY "GHLLinks: self insert"
      ON public.ghl_location_links
      FOR INSERT TO authenticated
      WITH CHECK (
        user_id = auth.uid()
        AND linked_by_user_id = auth.uid()
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ghl_location_links' AND policyname='GHLLinks: owner update') THEN
    CREATE POLICY "GHLLinks: owner update"
      ON public.ghl_location_links
      FOR UPDATE TO authenticated
      USING (workspace_owner_user_id = auth.uid() OR is_admin(auth.uid()))
      WITH CHECK (workspace_owner_user_id = auth.uid() OR is_admin(auth.uid()));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ghl_location_links' AND policyname='GHLLinks: member delete') THEN
    CREATE POLICY "GHLLinks: member delete"
      ON public.ghl_location_links
      FOR DELETE TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- =========================================================
-- DOWN (reversible — run manually if rollback needed)
-- =========================================================
-- DROP POLICY IF EXISTS "GHLLinks: member select" ON public.ghl_location_links;
-- DROP POLICY IF EXISTS "GHLLinks: self insert"   ON public.ghl_location_links;
-- DROP POLICY IF EXISTS "GHLLinks: owner update"  ON public.ghl_location_links;
-- DROP POLICY IF EXISTS "GHLLinks: member delete" ON public.ghl_location_links;
-- ALTER TABLE public.ghl_location_links DROP CONSTRAINT IF EXISTS ghl_location_links_user_loc_key;
-- DROP INDEX IF EXISTS public.idx_ghl_links_user;
-- DROP INDEX IF EXISTS public.idx_ghl_links_location;
-- ALTER TABLE public.ghl_location_links
--   ADD CONSTRAINT ghl_location_links_ghl_location_id_key UNIQUE (ghl_location_id);
-- ALTER TABLE public.ghl_location_links
--   DROP COLUMN IF EXISTS user_id,
--   DROP COLUMN IF EXISTS ghl_company_id;
