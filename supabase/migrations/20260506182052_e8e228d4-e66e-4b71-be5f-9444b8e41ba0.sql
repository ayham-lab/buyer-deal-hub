
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS marketing_name text,
  ADD COLUMN IF NOT EXISTS marketing_description text,
  ADD COLUMN IF NOT EXISTS marketing_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS marketing_photos text[] NOT NULL DEFAULT '{}'::text[];

-- Allow public (anon + authenticated) read of deals that owner has published
CREATE POLICY "Deals: public marketing read"
ON public.deals
FOR SELECT
TO anon, authenticated
USING (marketing_published = true);

-- Public bucket for marketing photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-marketing', 'deal-marketing', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "deal-marketing public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'deal-marketing');

CREATE POLICY "deal-marketing owner upload"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'deal-marketing' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "deal-marketing owner delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'deal-marketing' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "deal-marketing owner update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'deal-marketing' AND auth.uid()::text = (storage.foldername(name))[1]);
