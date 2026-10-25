-- Invoice and quotation BEFORE INSERT triggers invoke next_doc_number().
-- Allow signed-in users to reach the trigger; next_doc_number validates org membership.
-- Do not grant to PUBLIC or anon.
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO authenticated;
