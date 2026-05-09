CREATE TABLE public.oauth_install_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  company_id text,
  location_id text,
  payload jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.oauth_install_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "oauth_install_log: auth read"
ON public.oauth_install_log FOR SELECT
TO authenticated
USING (true);