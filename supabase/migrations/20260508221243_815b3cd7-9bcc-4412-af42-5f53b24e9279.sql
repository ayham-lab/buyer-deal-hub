CREATE TABLE public.webhook_debug_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  method text,
  headers jsonb,
  body jsonb,
  ip text,
  user_agent text,
  received_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.webhook_debug_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_webhook_debug"
ON public.webhook_debug_log
FOR SELECT
TO authenticated
USING (true);

CREATE INDEX idx_webhook_debug_log_received_at ON public.webhook_debug_log (received_at DESC);