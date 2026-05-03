
-- Timeline tracking columns
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emd_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Auto-stamp timeline events
CREATE OR REPLACE FUNCTION public.deals_track_timeline()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- closed_at when status moves to closed
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') AND NEW.closed_at IS NULL THEN
    NEW.closed_at := now();
  END IF;
  -- assigned_at when status moves to under_contract (assignment executed)
  IF NEW.status = 'under_contract' AND (OLD.status IS DISTINCT FROM 'under_contract') AND NEW.assigned_at IS NULL THEN
    NEW.assigned_at := now();
  END IF;
  -- emd_received_at when EMD flips to true
  IF NEW.emd_received = true AND (OLD.emd_received IS DISTINCT FROM true) AND NEW.emd_received_at IS NULL THEN
    NEW.emd_received_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deals_track_timeline ON public.deals;
CREATE TRIGGER trg_deals_track_timeline
BEFORE UPDATE ON public.deals
FOR EACH ROW
EXECUTE FUNCTION public.deals_track_timeline();

-- Deal files (photos, PSA, assignment, addendum, other)
CREATE TABLE IF NOT EXISTS public.deal_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  deal_id UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('photo','psa','assignment','addendum','other')),
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  size_bytes BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_deal_files_deal ON public.deal_files(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_files_category ON public.deal_files(deal_id, category);

ALTER TABLE public.deal_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DealFiles: owner select"
  ON public.deal_files FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR is_admin(auth.uid()));

CREATE POLICY "DealFiles: owner insert"
  ON public.deal_files FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.deals d WHERE d.id = deal_id AND d.user_id = auth.uid())
  );

CREATE POLICY "DealFiles: owner update"
  ON public.deal_files FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "DealFiles: owner delete"
  ON public.deal_files FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Storage bucket for deal files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('deal-files', 'deal-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies: files live under {user_id}/{deal_id}/...
CREATE POLICY "deal-files: owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'deal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "deal-files: owner insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'deal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "deal-files: owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'deal-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "deal-files: owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'deal-files' AND auth.uid()::text = (storage.foldername(name))[1]);
