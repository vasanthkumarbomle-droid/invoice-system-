-- Keep organization policies semantically identical while allowing auth.uid() to be
-- evaluated once per statement instead of repeatedly for each candidate row.
DROP POLICY IF EXISTS "create org" ON public.organizations;
CREATE POLICY "create org"
  ON public.organizations
  FOR INSERT
  TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "read org" ON public.organizations;
CREATE POLICY "read org"
  ON public.organizations
  FOR SELECT
  TO authenticated
  USING (public.is_member(id) OR created_by = (SELECT auth.uid()));

-- next_doc_number is not called by the browser application; keep it server-only.
REVOKE ALL ON FUNCTION public.next_doc_number(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO service_role;
