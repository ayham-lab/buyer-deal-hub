DROP POLICY IF EXISTS "archive_buyers: super_admin standalone delete" ON public.archive_buyers;
DROP POLICY IF EXISTS "archive_buyers: super_admin standalone insert" ON public.archive_buyers;
DROP POLICY IF EXISTS "archive_buyers: super_admin standalone update" ON public.archive_buyers;

CREATE POLICY "archive_buyers: super_admin delete"
  ON public.archive_buyers FOR DELETE TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "archive_buyers: super_admin insert"
  ON public.archive_buyers FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "archive_buyers: super_admin update"
  ON public.archive_buyers FOR UPDATE TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));