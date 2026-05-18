
CREATE TABLE IF NOT EXISTS public.manual_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  location_name text,
  ghl_company_id text,
  reason text NOT NULL,
  current_owner_user_id uuid,
  ghl_users_snapshot jsonb,
  status text NOT NULL DEFAULT 'pending',
  resolved_by_user_id uuid,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  UNIQUE (location_id)
);

ALTER TABLE public.manual_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mrq: super_admin all"
  ON public.manual_review_queue
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TABLE IF NOT EXISTS public.ownership_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id text NOT NULL,
  action text NOT NULL,
  old_owner_user_id uuid,
  new_owner_user_id uuid,
  ghl_admin_user_id text,
  ghl_admin_email text,
  executed_by text NOT NULL,
  executed_at timestamptz NOT NULL DEFAULT now(),
  detail jsonb
);

ALTER TABLE public.ownership_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oal: super_admin read"
  ON public.ownership_audit_log
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "oal: deny write"
  ON public.ownership_audit_log
  FOR INSERT TO authenticated WITH CHECK (false);

CREATE POLICY "oal: deny update"
  ON public.ownership_audit_log
  FOR UPDATE TO authenticated USING (false) WITH CHECK (false);

CREATE POLICY "oal: deny delete"
  ON public.ownership_audit_log
  FOR DELETE TO authenticated USING (false);

CREATE INDEX IF NOT EXISTS ownership_audit_log_location_idx ON public.ownership_audit_log (location_id, executed_at DESC);
CREATE INDEX IF NOT EXISTS manual_review_queue_status_idx ON public.manual_review_queue (status, created_at DESC);
