ALTER TABLE public.deals ADD COLUMN title_company_id UUID REFERENCES public.title_companies(id) ON DELETE SET NULL;
CREATE INDEX idx_deals_title_company_id ON public.deals(title_company_id);