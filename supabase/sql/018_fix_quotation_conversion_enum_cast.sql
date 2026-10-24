-- Migration 018: fix enum status casting and make quotation conversion repeatable.
-- Apply after migrations 001-017. The live database was updated directly; this file keeps the fix in source control.

CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(p_quote_id uuid, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_item record;
  v_invoice_id uuid;
  v_issue_date date;
  v_payment_terms_days integer := 15;
  v_position integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before converting a quotation.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found or you do not have access to it.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members AS member
    WHERE member.org_id = v_quote.org_id
      AND member.user_id = auth.uid()
      AND lower(COALESCE(member.role::text, '')) IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only business owners or admins can convert quotations.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients AS client
    WHERE client.id = v_quote.client_id AND client.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'The quotation client does not belong to the same organization.' USING ERRCODE = '23514';
  END IF;

  -- Return the existing invoice for repeated clicks/retries rather than creating a duplicate.
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE org_id = v_quote.org_id AND quotation_id = v_quote.id
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    IF lower(COALESCE(v_quote.status::text, '')) NOT IN ('accepted', 'converted') THEN
      RAISE EXCEPTION 'Only an accepted quotation can be converted to an invoice.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.quotations
    SET status = 'converted', invoice_id = v_invoice_id
    WHERE id = v_quote.id AND org_id = v_quote.org_id
      AND lower(status::text) IN ('accepted', 'converted');

    RETURN v_invoice_id;
  END IF;

  -- Cast enum status to text before COALESCE; '' is not a quotation_status enum value.
  IF lower(COALESCE(v_quote.status::text, '')) <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted quotation can be converted to an invoice.' USING ERRCODE = '23514';
  END IF;

  v_issue_date := timezone('Asia/Kolkata', now())::date;

  SELECT COALESCE(default_payment_terms_days, 15)
  INTO v_payment_terms_days
  FROM public.organizations
  WHERE id = v_quote.org_id;

  v_payment_terms_days := GREATEST(0, LEAST(COALESCE(v_payment_terms_days, 15), 3650));

  INSERT INTO public.invoices (org_id, client_id, quotation_id, issue_date, due_date, status, notes, terms)
  VALUES (
    v_quote.org_id,
    v_quote.client_id,
    v_quote.id,
    v_issue_date,
    COALESCE(p_due_date, v_issue_date + v_payment_terms_days),
    'pending',
    v_quote.notes,
    v_quote.terms
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT * FROM public.quotation_items
    WHERE quotation_id = v_quote.id AND org_id = v_quote.org_id
    ORDER BY position, id
  LOOP
    IF v_item.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products AS product
      WHERE product.id = v_item.product_id AND product.org_id = v_quote.org_id
    ) THEN
      RAISE EXCEPTION 'Every converted quotation product must belong to the same organization.' USING ERRCODE = '23514';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.unit_price IS NULL OR v_item.unit_price < 0
       OR COALESCE(v_item.discount_pct, 0) < 0 OR COALESCE(v_item.discount_pct, 0) > 100
       OR COALESCE(v_item.gst_rate, 0) < 0 OR COALESCE(v_item.gst_rate, 0) > 100 THEN
      RAISE EXCEPTION 'Quotation contains an invalid quantity, price, discount, or GST value.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.invoice_items (
      org_id, invoice_id, position, product_id, description,
      hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
    )
    VALUES (
      v_quote.org_id, v_invoice_id, v_position, v_item.product_id, v_item.description,
      v_item.hsn_sac, COALESCE(NULLIF(v_item.unit, ''), 'unit'),
      v_item.quantity, v_item.unit_price, COALESCE(v_item.discount_pct, 0),
      COALESCE(v_item.gst_rate, 0)
    );
    v_position := v_position + 1;
  END LOOP;

  IF v_position = 0 THEN
    RAISE EXCEPTION 'Cannot convert a quotation with no line items.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.quotations
  SET status = 'converted', invoice_id = v_invoice_id
  WHERE id = v_quote.id AND org_id = v_quote.org_id AND lower(status::text) = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while it was being converted.' USING ERRCODE = '40001';
  END IF;

  RETURN v_invoice_id;
END;
$function$
;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, date) TO authenticated;
