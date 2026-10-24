-- Migration 014: allow the trusted server workflow to allocate invoice numbers.
-- The normal authenticated-member check remains for browser callers. The bypass
-- is limited to a signed service_role JWT and is needed for public client acceptance.
CREATE OR REPLACE FUNCTION public.next_doc_number(p_org uuid, p_type text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  yr integer := extract(year from current_date)::integer;
  n integer;
  pref text;
BEGIN
  IF p_type NOT IN ('invoice', 'quotation') THEN
    RAISE EXCEPTION 'Unsupported document type.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND NOT public.is_member(p_org) THEN
    RAISE EXCEPTION 'Not a member of this organization.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.document_counters (org_id, doc_type, year, last_number)
  VALUES (p_org, p_type, yr, 1)
  ON CONFLICT (org_id, doc_type, year)
  DO UPDATE SET last_number = public.document_counters.last_number + 1
  RETURNING last_number INTO n;

  SELECT CASE WHEN p_type = 'invoice' THEN invoice_prefix ELSE quote_prefix END
    INTO pref
    FROM public.organizations
   WHERE id = p_org;

  IF pref IS NULL THEN
    RAISE EXCEPTION 'Organization not found for document numbering.' USING ERRCODE = 'P0002';
  END IF;

  RETURN pref || '-' || yr || '-' || lpad(n::text, 4, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_doc_number(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO authenticated, service_role;
