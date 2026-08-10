-- Global buyer registry: a company-owned master record of every buyer that has
-- ever entered the system, deduplicated to ONE ROW PER UNIQUE BUYER IDENTITY.
--
-- Users keep their own isolated buyer lists in public.buyers (RLS by user_id).
-- This registry is an internal mirror maintained by a trigger on public.buyers,
-- so it captures every write path (app UI, CSV import, buyer-intake edge
-- function, admin tools) with no app-code changes.
--
-- Identity rule (deterministic, enforced by unique indexes):
--   1. normalized email (lowercased, trimmed) is the primary identity
--   2. normalized phone (digits only, last 10) is used only when there is no email
--   3. different emails sharing a phone stay separate (shared office lines
--      must not merge two people)
--   4. buyers with neither email nor phone cannot be safely deduped and each
--      get their own row
--
-- Provenance is never lost: global_buyer_registry_sources keeps one row per
-- source public.buyers row forever (who added the buyer, which location, full
-- snapshot), pointing at its canonical registry identity. Deleting a buyer
-- tombstones its source row; the identity row itself is only tombstoned
-- (all_sources_deleted_at) once every source is gone, and revives if the buyer
-- ever re-enters the system.

-- ---------------------------------------------------------------------------
-- Normalization helpers (IMMUTABLE so they can back generated columns)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_email(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(lower(btrim(p)), '')
$$;

CREATE OR REPLACE FUNCTION public.normalize_phone(p text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(t.d) >= 7 THEN right(t.d, 10) END
  FROM (SELECT regexp_replace(coalesce(p, ''), '\D', '', 'g')) AS t(d)
$$;

-- ---------------------------------------------------------------------------
-- Registry: one row per unique buyer identity
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_buyer_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- best-known identity fields, refreshed as sources sync
  name text,
  first_name text,
  last_name text,
  company_name text,
  email text,
  phone text,
  email_norm text GENERATED ALWAYS AS (public.normalize_email(email)) STORED,
  phone_norm text GENERATED ALWAYS AS (public.normalize_phone(phone)) STORED,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  -- set only when every source row is deleted; cleared on re-entry
  all_sources_deleted_at timestamptz
);

-- The duplicate guarantee
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbr_email
  ON public.global_buyer_registry (email_norm) WHERE email_norm IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_gbr_phone_when_no_email
  ON public.global_buyer_registry (phone_norm) WHERE email_norm IS NULL AND phone_norm IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_gbr_phone_norm
  ON public.global_buyer_registry (phone_norm) WHERE phone_norm IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Sources: one row per source buyers row, kept forever (provenance + snapshot)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.global_buyer_registry_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registry_id uuid NOT NULL REFERENCES public.global_buyer_registry(id) ON DELETE CASCADE,
  -- plain uuids (no FKs to buyers/auth.users) so rows survive source deletion
  source_buyer_id uuid NOT NULL UNIQUE,
  source_user_id uuid,
  ghl_location_id text,
  -- full snapshot of the source row; survives future buyers schema changes
  buyer_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  source_deleted_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_gbrs_registry ON public.global_buyer_registry_sources (registry_id);
CREATE INDEX IF NOT EXISTS idx_gbrs_user ON public.global_buyer_registry_sources (source_user_id);
CREATE INDEX IF NOT EXISTS idx_gbrs_location ON public.global_buyer_registry_sources (ghl_location_id);

-- ---------------------------------------------------------------------------
-- Access: internal tables. RLS on; only super_admin may read from the client.
-- No client write policies — writes happen only via the SECURITY DEFINER
-- functions below (or service_role, which bypasses RLS).
-- ---------------------------------------------------------------------------
ALTER TABLE public.global_buyer_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_buyer_registry_sources ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "global_buyer_registry: super_admin read" ON public.global_buyer_registry;
CREATE POLICY "global_buyer_registry: super_admin read"
  ON public.global_buyer_registry FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "gbr_sources: super_admin read" ON public.global_buyer_registry_sources;
CREATE POLICY "gbr_sources: super_admin read"
  ON public.global_buyer_registry_sources FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- ---------------------------------------------------------------------------
-- Core upsert: resolve identity and link a buyers row into the registry.
-- Shared by the trigger AND the backfill below, so they can never disagree.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_global_buyer(b public.buyers, p_seen_at timestamptz DEFAULT now())
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_phone text;
  v_reg uuid;
  v_cur uuid;
BEGIN
  v_email := public.normalize_email(b.email);
  v_phone := public.normalize_phone(b.phone);

  -- Resolve canonical identity: email first; phone only when no email
  IF v_email IS NOT NULL THEN
    SELECT id INTO v_reg FROM public.global_buyer_registry WHERE email_norm = v_email;
  ELSIF v_phone IS NOT NULL THEN
    SELECT id INTO v_reg FROM public.global_buyer_registry
     WHERE phone_norm = v_phone
     ORDER BY (email_norm IS NULL), first_seen_at, id
     LIMIT 1;
  END IF;

  SELECT registry_id INTO v_cur FROM public.global_buyer_registry_sources
   WHERE source_buyer_id = b.id;

  IF v_reg IS NULL THEN
    IF v_cur IS NOT NULL THEN
      v_reg := v_cur;  -- identity matches nobody else; stay with current row
    ELSE
      BEGIN
        INSERT INTO public.global_buyer_registry (name, first_name, last_name, company_name, email, phone, first_seen_at)
        VALUES (b.name, b.first_name, b.last_name, b.company_name, b.email, b.phone, p_seen_at)
        RETURNING id INTO v_reg;
      EXCEPTION WHEN unique_violation THEN
        -- concurrent writer created the same identity; use theirs
        IF v_email IS NOT NULL THEN
          SELECT id INTO v_reg FROM public.global_buyer_registry WHERE email_norm = v_email;
        ELSE
          SELECT id INTO v_reg FROM public.global_buyer_registry
           WHERE phone_norm = v_phone
           ORDER BY (email_norm IS NULL), first_seen_at, id
           LIMIT 1;
        END IF;
        IF v_reg IS NULL THEN RAISE; END IF;
      END;
    END IF;
  END IF;

  INSERT INTO public.global_buyer_registry_sources (
    registry_id, source_buyer_id, source_user_id, ghl_location_id, buyer_data, first_seen_at
  ) VALUES (
    v_reg, b.id, b.user_id, b.ghl_location_id, to_jsonb(b), p_seen_at
  )
  ON CONFLICT (source_buyer_id) DO UPDATE SET
    registry_id       = EXCLUDED.registry_id,
    source_user_id    = EXCLUDED.source_user_id,
    ghl_location_id   = EXCLUDED.ghl_location_id,
    buyer_data        = EXCLUDED.buyer_data,
    last_synced_at    = now(),
    source_deleted_at = NULL;

  -- If this source was re-linked (e.g. email corrected to match an existing
  -- buyer), remove its old registry row when nothing points at it anymore.
  IF v_cur IS NOT NULL AND v_cur <> v_reg THEN
    DELETE FROM public.global_buyer_registry g
     WHERE g.id = v_cur
       AND NOT EXISTS (SELECT 1 FROM public.global_buyer_registry_sources s
                        WHERE s.registry_id = v_cur);
  END IF;

  -- Refresh best-known identity fields; if a field update would collide with
  -- another identity's unique index (race), keep the existing values.
  BEGIN
    UPDATE public.global_buyer_registry SET
      name          = COALESCE(b.name, name),
      first_name    = COALESCE(b.first_name, first_name),
      last_name     = COALESCE(b.last_name, last_name),
      company_name  = COALESCE(b.company_name, company_name),
      email         = COALESCE(b.email, email),
      phone         = COALESCE(b.phone, phone),
      last_synced_at = now(),
      all_sources_deleted_at = NULL
    WHERE id = v_reg;
  EXCEPTION WHEN unique_violation THEN
    UPDATE public.global_buyer_registry
       SET last_synced_at = now(), all_sources_deleted_at = NULL
     WHERE id = v_reg;
  END;
END;
$$;
-- Writes through SECURITY DEFINER: not callable from clients
REVOKE EXECUTE ON FUNCTION public.upsert_global_buyer(public.buyers, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_global_buyer(public.buyers, timestamptz) TO service_role;

-- ---------------------------------------------------------------------------
-- Trigger: mirror every insert/update/delete of public.buyers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_global_buyer_registry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reg uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE public.global_buyer_registry_sources
       SET source_deleted_at = now(), last_synced_at = now()
     WHERE source_buyer_id = OLD.id
     RETURNING registry_id INTO v_reg;
    IF v_reg IS NOT NULL THEN
      UPDATE public.global_buyer_registry g
         SET all_sources_deleted_at = now(), last_synced_at = now()
       WHERE g.id = v_reg
         AND NOT EXISTS (SELECT 1 FROM public.global_buyer_registry_sources s
                          WHERE s.registry_id = v_reg AND s.source_deleted_at IS NULL);
    END IF;
    RETURN OLD;
  END IF;

  PERFORM public.upsert_global_buyer(NEW);
  RETURN NEW;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.sync_global_buyer_registry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_buyers_sync_global_registry ON public.buyers;
CREATE TRIGGER trg_buyers_sync_global_registry
  AFTER INSERT OR UPDATE OR DELETE ON public.buyers
  FOR EACH ROW EXECUTE FUNCTION public.sync_global_buyer_registry();

-- ---------------------------------------------------------------------------
-- Backfill: replay every existing buyer through the same upsert path, oldest
-- first, so pre-existing duplicates collapse exactly as live writes would.
-- Idempotent (safe to re-run): sources upsert on source_buyer_id.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r public.buyers%ROWTYPE;
BEGIN
  FOR r IN SELECT * FROM public.buyers ORDER BY created_at, id LOOP
    PERFORM public.upsert_global_buyer(r, r.created_at);
  END LOOP;
END $$;
