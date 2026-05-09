DROP POLICY IF EXISTS "Deals: public marketing read" ON public.deals;

CREATE POLICY "Deals: public marketing read"
  ON public.deals
  FOR SELECT
  TO anon
  USING (marketing_published = true);