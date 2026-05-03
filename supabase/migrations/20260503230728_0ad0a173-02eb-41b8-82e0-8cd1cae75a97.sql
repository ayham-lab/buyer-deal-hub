ALTER TABLE public.deals ADD COLUMN owner_id UUID;
UPDATE public.deals SET owner_id = user_id WHERE owner_id IS NULL;
CREATE INDEX idx_deals_owner_id ON public.deals(owner_id);