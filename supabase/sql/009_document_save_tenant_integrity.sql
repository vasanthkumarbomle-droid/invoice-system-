-- Migration 009: explicitly enforce tenant ownership for document saves.
-- Apply after 008 on the existing LedgerFlow core schema. This is additive and
-- does not replace the application's original core schema or its tax triggers.

CREATE OR REPLACE FUNCTION public.save_invoice_with_items(
    p_org_id uuid,
    p_document_id uuid,
    p_invoice jsonb,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid := p_document_id;
    v_client_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_discount_pct numeric;
    v_gst_rate numeric;
    v_position integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in before saving an invoice.' USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.org_members AS member
        WHERE member.org_id = p_org_id AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You do not belong to this organization.' USING ERRCODE = '42501';
    END IF;

    IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object'
       OR (p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array') THEN
        RAISE EXCEPTION 'Invalid invoice payload.' USING ERRCODE = '22023';
    END IF;

    v_client_id := NULLIF(p_invoice->>'client_id', '')::uuid;
    IF v_client_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.clients AS client
        WHERE client.id = v_client_id AND client.org_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'The invoice client must belong to the same organization.' USING ERRCODE = '23514';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.invoices (
            org_id, client_id, issue_date, due_date, status, notes
        )
        VALUES (
            p_org_id, v_client_id,
            COALESCE(NULLIF(p_invoice->>'issue_date', '')::date, CURRENT_DATE),
            NULLIF(p_invoice->>'due_date', '')::date,
            COALESCE(NULLIF(p_invoice->>'status', ''), 'draft'),
            NULLIF(p_invoice->>'notes', '')
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.invoices
        SET client_id = v_client_id,
            issue_date = COALESCE(NULLIF(p_invoice->>'issue_date', '')::date, issue_date),
            due_date = NULLIF(p_invoice->>'due_date', '')::date,
            status = COALESCE(NULLIF(p_invoice->>'status', ''), status),
            notes = NULLIF(p_invoice->>'notes', '')
        WHERE id = v_id AND org_id = p_org_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice not found in this organization.';
        END IF;

        DELETE FROM public.invoice_items
        WHERE invoice_id = v_id AND org_id = p_org_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
        v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1);
        v_unit_price := COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0);
        v_discount_pct := COALESCE(NULLIF(v_item->>'discount_pct', '')::numeric, 0);
        v_gst_rate := COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0);

        IF v_quantity <= 0 OR v_unit_price < 0
           OR v_discount_pct < 0 OR v_discount_pct > 100
           OR v_gst_rate < 0 OR v_gst_rate > 100 THEN
            RAISE EXCEPTION 'Invoice items contain invalid quantity, price, discount, or GST values.'
                USING ERRCODE = '23514';
        END IF;

        IF v_product_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.products AS product
            WHERE product.id = v_product_id AND product.org_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Every selected invoice product must belong to the same organization.'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.invoice_items (
            org_id, invoice_id, position, product_id, description,
            hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
        )
        VALUES (
            p_org_id, v_id, v_position, v_product_id,
            COALESCE(v_item->>'description', ''),
            NULLIF(v_item->>'hsn_sac', ''),
            COALESCE(NULLIF(v_item->>'unit', ''), 'unit'),
            v_quantity, v_unit_price, v_discount_pct, v_gst_rate
        );
        v_position := v_position + 1;
    END LOOP;

    RETURN v_id;
END;
$$;


CREATE OR REPLACE FUNCTION public.save_quotation_with_items(
    p_org_id uuid,
    p_document_id uuid,
    p_quotation jsonb,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id uuid := p_document_id;
    v_client_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_discount_pct numeric;
    v_gst_rate numeric;
    v_position integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in before saving a quotation.' USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.org_members AS member
        WHERE member.org_id = p_org_id AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You do not belong to this organization.' USING ERRCODE = '42501';
    END IF;

    IF p_quotation IS NULL OR jsonb_typeof(p_quotation) <> 'object'
       OR (p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array') THEN
        RAISE EXCEPTION 'Invalid quotation payload.' USING ERRCODE = '22023';
    END IF;

    v_client_id := NULLIF(p_quotation->>'client_id', '')::uuid;
    IF v_client_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.clients AS client
        WHERE client.id = v_client_id AND client.org_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'The quotation client must belong to the same organization.' USING ERRCODE = '23514';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.quotations (
            org_id, client_id, issue_date, valid_until, status, notes, terms
        )
        VALUES (
            p_org_id, v_client_id,
            COALESCE(NULLIF(p_quotation->>'issue_date', '')::date, CURRENT_DATE),
            NULLIF(p_quotation->>'valid_until', '')::date,
            COALESCE(NULLIF(p_quotation->>'status', ''), 'draft'),
            NULLIF(p_quotation->>'notes', ''),
            NULLIF(p_quotation->>'terms', '')
        )
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.quotations
        SET client_id = v_client_id,
            issue_date = COALESCE(NULLIF(p_quotation->>'issue_date', '')::date, issue_date),
            valid_until = NULLIF(p_quotation->>'valid_until', '')::date,
            status = COALESCE(NULLIF(p_quotation->>'status', ''), status),
            notes = NULLIF(p_quotation->>'notes', ''),
            terms = NULLIF(p_quotation->>'terms', '')
        WHERE id = v_id AND org_id = p_org_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Quotation not found in this organization.';
        END IF;

        DELETE FROM public.quotation_items
        WHERE quotation_id = v_id AND org_id = p_org_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
        v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1);
        v_unit_price := COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0);
        v_discount_pct := COALESCE(NULLIF(v_item->>'discount_pct', '')::numeric, 0);
        v_gst_rate := COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0);

        IF v_quantity <= 0 OR v_unit_price < 0
           OR v_discount_pct < 0 OR v_discount_pct > 100
           OR v_gst_rate < 0 OR v_gst_rate > 100 THEN
            RAISE EXCEPTION 'Quotation items contain invalid quantity, price, discount, or GST values.'
                USING ERRCODE = '23514';
        END IF;

        IF v_product_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.products AS product
            WHERE product.id = v_product_id AND product.org_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Every selected quotation product must belong to the same organization.'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.quotation_items (
            org_id, quotation_id, position, product_id, description,
            hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
        )
        VALUES (
            p_org_id, v_id, v_position, v_product_id,
            COALESCE(v_item->>'description', ''),
            NULLIF(v_item->>'hsn_sac', ''),
            COALESCE(NULLIF(v_item->>'unit', ''), 'unit'),
            v_quantity, v_unit_price, v_discount_pct, v_gst_rate
        );
        v_position := v_position + 1;
    END LOOP;

    RETURN v_id;
END;
$$;


-- Conversion is a separate write path, so independently validate product
-- ownership here too (older quotations may predate the hardened save RPC).
CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(
  p_quote_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $
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
      AND lower(COALESCE(member.role, '')) IN ('owner', 'admin')
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

  INSERT INTO public.invoices (org_id, client_id, issue_date, due_date, status, notes)
  VALUES (
    v_quote.org_id,
    v_quote.client_id,
    v_issue_date,
    COALESCE(p_due_date, v_issue_date + v_payment_terms_days),
    'pending',
    v_quote.notes
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
$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  TO authenticated;

REVOKE ALL ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb)
    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb)
    TO authenticated;

-- invoice_refresh is an internal SECURITY DEFINER helper invoked by payment
-- triggers. Do not expose it as an arbitrary client-callable RPC.
REVOKE ALL ON FUNCTION public.invoice_refresh(uuid)
    FROM PUBLIC, anon, authenticated;
