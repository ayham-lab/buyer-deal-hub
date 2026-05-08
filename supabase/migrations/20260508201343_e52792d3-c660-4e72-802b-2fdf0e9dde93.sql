CREATE TABLE public.ghl_dispo_stage_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_location_id text NOT NULL,
  ghl_pipeline_id text NOT NULL,
  ghl_pipeline_name text,
  ghl_stage_id text NOT NULL,
  ghl_stage_name text,
  workspace_owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ghl_location_id, ghl_stage_id)
);

ALTER TABLE public.ghl_dispo_stage_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "DispoMap: owner select"
  ON public.ghl_dispo_stage_mappings FOR SELECT
  TO authenticated
  USING (workspace_owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE POLICY "DispoMap: owner insert"
  ON public.ghl_dispo_stage_mappings FOR INSERT
  TO authenticated
  WITH CHECK (workspace_owner_user_id = auth.uid());

CREATE POLICY "DispoMap: owner delete"
  ON public.ghl_dispo_stage_mappings FOR DELETE
  TO authenticated
  USING (workspace_owner_user_id = auth.uid() OR public.is_admin(auth.uid()));

CREATE TRIGGER trg_dispo_map_updated_at
  BEFORE UPDATE ON public.ghl_dispo_stage_mappings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_dispo_map_location_stage
  ON public.ghl_dispo_stage_mappings (ghl_location_id, ghl_stage_id);