
CREATE TABLE public.pipeline_stage_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ghl_location_id TEXT NOT NULL,
  stage_id TEXT NOT NULL,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ghl_location_id, stage_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pipeline_stage_settings TO authenticated;
GRANT ALL ON public.pipeline_stage_settings TO service_role;

ALTER TABLE public.pipeline_stage_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stage_settings: members can read"
  ON public.pipeline_stage_settings FOR SELECT
  TO authenticated
  USING (
    public.is_location_member(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "stage_settings: owners/admins can insert"
  ON public.pipeline_stage_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "stage_settings: owners/admins can update"
  ON public.pipeline_stage_settings FOR UPDATE
  TO authenticated
  USING (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  )
  WITH CHECK (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "stage_settings: owners/admins can delete"
  ON public.pipeline_stage_settings FOR DELETE
  TO authenticated
  USING (
    public.is_location_owner(auth.uid(), ghl_location_id)
    OR public.is_admin(auth.uid())
    OR public.is_super_admin(auth.uid())
  );

CREATE TRIGGER update_pipeline_stage_settings_updated_at
  BEFORE UPDATE ON public.pipeline_stage_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
