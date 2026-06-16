-- Realtors and Notaries: personal + archive tables, same pattern as buyers/archive_buyers

-- ============ REALTORS ============
CREATE TABLE public.realtors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ghl_location_id text,
  name text NOT NULL,
  first_name text,
  last_name text,
  email text,
  phone text,
  brokerage text,
  does_novations boolean NOT NULL DEFAULT false,
  markets text[] NOT NULL DEFAULT '{}',
  notes text,
  last_contact_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.realtors TO authenticated;
GRANT ALL ON public.realtors TO service_role;
ALTER TABLE public.realtors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Realtors: scoped select" ON public.realtors FOR SELECT
  USING (
    ((auth.uid() = user_id) OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
     OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
     OR (ghl_location_id IS NOT NULL AND location_in_active_group(ghl_location_id))
     OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    )
    AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()) OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  );
CREATE POLICY "Realtors: scoped insert" ON public.realtors FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  );
CREATE POLICY "Realtors: scoped update" ON public.realtors FOR UPDATE
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
     OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id)))
    AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()) OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  );
CREATE POLICY "Realtors: scoped delete" ON public.realtors FOR DELETE
  USING (
    auth.uid() = user_id OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
  );

CREATE TRIGGER trg_realtors_updated_at BEFORE UPDATE ON public.realtors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_realtors_user ON public.realtors(user_id);
CREATE INDEX idx_realtors_location ON public.realtors(ghl_location_id);
CREATE INDEX idx_realtors_email ON public.realtors(lower(email));

-- ============ ARCHIVE REALTORS ============
CREATE TABLE public.archive_realtors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  first_name text,
  last_name text,
  email text,
  phone text,
  brokerage text,
  does_novations boolean NOT NULL DEFAULT false,
  markets text[] NOT NULL DEFAULT '{}',
  notes text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.archive_realtors TO authenticated;
GRANT ALL ON public.archive_realtors TO service_role;
ALTER TABLE public.archive_realtors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ArchiveRealtors: read all auth" ON public.archive_realtors FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);
CREATE POLICY "ArchiveRealtors: super_admin insert" ON public.archive_realtors FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveRealtors: super_admin update" ON public.archive_realtors FOR UPDATE
  USING (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveRealtors: super_admin delete" ON public.archive_realtors FOR DELETE
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER trg_archive_realtors_updated_at BEFORE UPDATE ON public.archive_realtors
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ NOTARIES ============
CREATE TABLE public.notaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ghl_location_id text,
  name text NOT NULL,
  first_name text,
  last_name text,
  email text,
  phone text,
  markets text[] NOT NULL DEFAULT '{}',
  notes text,
  last_contact_at timestamptz,
  is_archived boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notaries TO authenticated;
GRANT ALL ON public.notaries TO service_role;
ALTER TABLE public.notaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notaries: scoped select" ON public.notaries FOR SELECT
  USING (
    ((auth.uid() = user_id) OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
     OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
     OR (ghl_location_id IS NOT NULL AND location_in_active_group(ghl_location_id))
     OR (user_id IS NULL AND current_ghl_location() IS NOT NULL AND ghl_location_id = current_ghl_location())
    )
    AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()) OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  );
CREATE POLICY "Notaries: scoped insert" ON public.notaries FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()))
  );
CREATE POLICY "Notaries: scoped update" ON public.notaries FOR UPDATE
  USING (
    (auth.uid() = user_id OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
     OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id)))
    AND ((current_ghl_location() IS NULL) OR (ghl_location_id IS NOT NULL AND ghl_location_id = current_ghl_location()) OR is_admin(auth.uid()) OR is_super_admin(auth.uid()))
  );
CREATE POLICY "Notaries: scoped delete" ON public.notaries FOR DELETE
  USING (
    auth.uid() = user_id OR is_admin(auth.uid()) OR is_super_admin(auth.uid())
    OR (ghl_location_id IS NOT NULL AND is_location_member(auth.uid(), ghl_location_id))
  );

CREATE TRIGGER trg_notaries_updated_at BEFORE UPDATE ON public.notaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_notaries_user ON public.notaries(user_id);
CREATE INDEX idx_notaries_location ON public.notaries(ghl_location_id);
CREATE INDEX idx_notaries_email ON public.notaries(lower(email));

-- ============ ARCHIVE NOTARIES ============
CREATE TABLE public.archive_notaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  first_name text,
  last_name text,
  email text,
  phone text,
  markets text[] NOT NULL DEFAULT '{}',
  notes text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.archive_notaries TO authenticated;
GRANT ALL ON public.archive_notaries TO service_role;
ALTER TABLE public.archive_notaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ArchiveNotaries: read all auth" ON public.archive_notaries FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);
CREATE POLICY "ArchiveNotaries: super_admin insert" ON public.archive_notaries FOR INSERT
  WITH CHECK (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveNotaries: super_admin update" ON public.archive_notaries FOR UPDATE
  USING (is_super_admin(auth.uid()));
CREATE POLICY "ArchiveNotaries: super_admin delete" ON public.archive_notaries FOR DELETE
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER trg_archive_notaries_updated_at BEFORE UPDATE ON public.archive_notaries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();