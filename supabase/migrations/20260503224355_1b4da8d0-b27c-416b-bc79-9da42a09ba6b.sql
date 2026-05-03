ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS contract_price numeric,
  ADD COLUMN IF NOT EXISTS minimum_sale_price numeric,
  ADD COLUMN IF NOT EXISTS jv_partner_name text;