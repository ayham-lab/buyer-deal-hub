
-- Harden ghl_location_tokens: secrets table. Only standalone admins may read.
DROP POLICY IF EXISTS "GHLTokens: scoped auth read" ON public.ghl_location_tokens;
CREATE POLICY "GHLTokens: standalone admin read"
ON public.ghl_location_tokens
FOR SELECT
TO authenticated
USING (current_ghl_location() IS NULL AND public.is_admin(auth.uid()));

-- Explicit deny for DELETE/UPDATE/INSERT (no policy already blocks them, but
-- make intent explicit and prevent future permissive policies from leaking).
CREATE POLICY "GHLTokens: deny delete"
ON public.ghl_location_tokens FOR DELETE TO authenticated, anon USING (false);
CREATE POLICY "GHLTokens: deny update"
ON public.ghl_location_tokens FOR UPDATE TO authenticated, anon USING (false) WITH CHECK (false);
CREATE POLICY "GHLTokens: deny insert"
ON public.ghl_location_tokens FOR INSERT TO authenticated, anon WITH CHECK (false);
