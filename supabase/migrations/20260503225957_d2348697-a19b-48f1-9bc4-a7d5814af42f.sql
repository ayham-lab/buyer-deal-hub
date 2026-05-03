CREATE TABLE public.title_companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  contact_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  service_states TEXT[] NOT NULL DEFAULT '{}',
  service_cities TEXT[] NOT NULL DEFAULT '{}',
  charges_file_fee BOOLEAN NOT NULL DEFAULT false,
  file_fee_amount NUMERIC,
  deal_types TEXT[] NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.title_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "TitleCo: owner select" ON public.title_companies
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin(auth.uid()));

CREATE POLICY "TitleCo: owner insert" ON public.title_companies
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "TitleCo: owner update" ON public.title_companies
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "TitleCo: owner delete" ON public.title_companies
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_title_companies_updated_at
  BEFORE UPDATE ON public.title_companies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();