
CREATE TABLE public.archive_title_companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_name text,
  email text,
  phone text,
  address text,
  service_states text[] NOT NULL DEFAULT '{}',
  service_cities text[] NOT NULL DEFAULT '{}',
  charges_file_fee boolean NOT NULL DEFAULT false,
  file_fee_amount numeric,
  deal_types text[] NOT NULL DEFAULT '{}',
  notes text,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_title_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "archive_title_companies: read for authenticated"
  ON public.archive_title_companies FOR SELECT TO authenticated USING (true);

CREATE POLICY "archive_title_companies: super_admin insert"
  ON public.archive_title_companies FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "archive_title_companies: super_admin update"
  ON public.archive_title_companies FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid())) WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "archive_title_companies: super_admin delete"
  ON public.archive_title_companies FOR DELETE TO authenticated
  USING (is_super_admin(auth.uid()));

CREATE TRIGGER archive_title_companies_updated_at
  BEFORE UPDATE ON public.archive_title_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX archive_title_companies_name_trgm ON public.archive_title_companies
  USING gin (lower(name) gin_trgm_ops);
CREATE INDEX archive_title_companies_states_idx ON public.archive_title_companies
  USING gin (service_states);
CREATE INDEX archive_title_companies_active_idx ON public.archive_title_companies (is_active);
