-- Migration 013: fix enum role conversion and create invoices atomically on acceptance.
-- The conversion RPC casts member_role to text before comparing text values.
-- Accepted quote responses and invoice creation happen in one transaction.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_quotation
  ON public.invoices (org_id, quotation_id)
  WHERE quotation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(
  p_quote_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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

  IF lower(COALESCE(v_quote.status, '')) <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted quotation can be converted to an invoice.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients AS client
    WHERE client.id = v_quote.client_id AND client.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'The quotation client does not belong to the same organization.' USING ERRCODE = '23514';
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
      RAISE EXCEPTION 'Every converted quotation product must belong to the same organization.'
        USING ERRCODE = '23514';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.unit_price IS NULL OR v_item.unit_price < 0
       OR COALESCE(v_item.discount_pct, 0) < 0
       OR COALESCE(v_item.discount_pct, 0) > 100
       OR COALESCE(v_item.gst_rate, 0) < 0
       OR COALESCE(v_item.gst_rate, 0) > 100 THEN
      RAISE EXCEPTION 'Quotation contains an invalid quantity, price, discount, or GST value.'
        USING ERRCODE = '23514';
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
  SET status = 'converted'
  WHERE id = v_quote.id AND org_id = v_quote.org_id AND lower(status) = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while it was being converted.' USING ERRCODE = '40001';
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.respond_to_quotation_and_convert_to_invoice(
  p_token_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_token public.document_share_tokens%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_item record;
  v_invoice_id uuid;
  v_issue_date date;
  v_payment_terms_days integer := 15;
  v_position integer := 0;
  v_responded_at timestamptz := now();
  v_today date := timezone('Asia/Kolkata', now())::date;
  v_already_accepted boolean := false;
BEGIN
  -- This RPC is only for the trusted Edge Function using the service-role JWT.
  -- The function is SECURITY DEFINER, so its callable roles must remain restricted.
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'This quotation-response action is restricted to the server workflow.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_token
    FROM public.document_share_tokens
   WHERE id = p_token_id
   FOR UPDATE;

  IF NOT FOUND OR v_token.document_type <> 'quotation' THEN
    RAISE EXCEPTION 'Quotation response link not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Allow an already-accepted response to safely finish conversion if a previous
  -- request recorded the response but stopped before creating the invoice.
  IF v_token.response_status = 'accepted' AND v_token.responded_at IS NOT NULL THEN
    v_already_accepted := true;
  ELSIF v_token.response_status IS NOT NULL OR v_token.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'A response has already been recorded for this quotation.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_already_accepted AND v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'This quotation link has expired. Ask the sender to resend it.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_quote
    FROM public.quotations
   WHERE id = v_token.document_id
     AND org_id = v_token.org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.status::text = 'converted' THEN
    SELECT id INTO v_invoice_id
      FROM public.invoices
     WHERE org_id = v_quote.org_id AND quotation_id = v_quote.id
     LIMIT 1;
    IF v_invoice_id IS NULL THEN
      RAISE EXCEPTION 'This quotation is marked converted but no linked invoice was found. Contact the business owner.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT v_already_accepted THEN
      UPDATE public.document_share_tokens
         SET response_status = 'accepted', responded_at = v_responded_at
       WHERE id = v_token.id AND responded_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'responseStatus', 'accepted',
      'respondedAt', COALESCE(v_token.responded_at, v_responded_at),
      'invoiceCreated', false,
      'invoiceId', v_invoice_id
    );
  END IF;

  IF v_quote.status::text NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'This quotation is no longer awaiting acceptance.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_already_accepted AND v_quote.valid_until IS NOT NULL AND v_quote.valid_until < v_today THEN
    RAISE EXCEPTION 'This quotation has expired. Ask the sender for an updated quotation.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients AS client
    WHERE client.id = v_quote.client_id AND client.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'The quotation client does not belong to this organization.'
      USING ERRCODE = '23514';
  END IF;

  -- Return an existing linked invoice instead of ever creating a duplicate.
  SELECT id INTO v_invoice_id
    FROM public.invoices
   WHERE org_id = v_quote.org_id AND quotation_id = v_quote.id
   LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    UPDATE public.quotations
       SET status = 'converted'
     WHERE id = v_quote.id AND org_id = v_quote.org_id;
    UPDATE public.document_share_tokens
       SET response_status = 'accepted',
           responded_at = COALESCE(responded_at, v_responded_at)
     WHERE id = v_token.id;
    RETURN jsonb_build_object(
      'success', true,
      'responseStatus', 'accepted',
      'respondedAt', COALESCE(v_token.responded_at, v_responded_at),
      'invoiceCreated', false,
      'invoiceId', v_invoice_id
    );
  END IF;

  v_issue_date := timezone('Asia/Kolkata', now())::date;
  SELECT COALESCE(default_payment_terms_days, 15)
    INTO v_payment_terms_days
    FROM public.organizations
   WHERE id = v_quote.org_id;
  v_payment_terms_days := GREATEST(0, LEAST(COALESCE(v_payment_terms_days, 15), 3650));

  INSERT INTO public.invoices (
    org_id, client_id, quotation_id, issue_date, due_date, status, notes, terms
  )
  VALUES (
    v_quote.org_id,
    v_quote.client_id,
    v_quote.id,
    v_issue_date,
    v_issue_date + v_payment_terms_days,
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
      RAISE EXCEPTION 'A quotation item refers to a product outside this organization.'
        USING ERRCODE = '23514';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.unit_price IS NULL OR v_item.unit_price < 0
       OR COALESCE(v_item.discount_pct, 0) < 0 OR COALESCE(v_item.discount_pct, 0) > 100
       OR COALESCE(v_item.gst_rate, 0) < 0 OR COALESCE(v_item.gst_rate, 0) > 100 THEN
      RAISE EXCEPTION 'The quotation contains an invalid quantity, price, discount, or GST value.'
        USING ERRCODE = '23514';
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
    RAISE EXCEPTION 'Cannot convert a quotation without any line items.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.quotations
     SET status = 'converted'
   WHERE id = v_quote.id
     AND org_id = v_quote.org_id
     AND status::text IN ('sent', 'accepted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while the invoice was being created.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.document_share_tokens
     SET response_status = 'accepted',
         responded_at = COALESCE(responded_at, v_responded_at)
   WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'success', true,
    'responseStatus', 'accepted',
    'respondedAt', v_responded_at,
    'invoiceCreated', true,
    'invoiceId', v_invoice_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.respond_to_quotation_and_convert_to_invoice(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.respond_to_quotation_and_convert_to_invoice(uuid)
  TO service_role;

