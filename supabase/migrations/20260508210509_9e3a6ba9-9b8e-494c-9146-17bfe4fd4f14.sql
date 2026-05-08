-- Enable RLS on ghl_location_tokens
ALTER TABLE public.ghl_location_tokens ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read all installed locations
CREATE POLICY "auth_read_tokens"
ON public.ghl_location_tokens
FOR SELECT
TO authenticated
USING (true);