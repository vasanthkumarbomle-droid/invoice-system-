-- Migration 004: quotation conversion and persisted bank account holder.
-- Apply this migration in Supabase SQL Editor after migration 003.
-- It intentionally relies on the existing LedgerFlow core tables and their
-- tax/numbering triggers, which are part of the established application schema.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS bank_account_holder text;

CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(
  p_quote_id uuid,
  p_due_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_item record;
  v_invoice_id uuid;
  v_payment_terms_days integer := 15;
  v_position integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before converting a quotation.';
  END IF;

  SELECT *
    INTO v_quote
    FROM public.quotations
   WHERE id = p_quote_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found or you do not have access to it.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.org_members AS member
     WHERE member.org_id = v_quote.org_id
       AND member.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You do not have permission to convert this quotation.';
  END IF;

  IF lower(COALESCE(v_quote.status, '')) <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted quotation can be converted to an invoice.';
  END IF;

  SELECT COALESCE(default_payment_terms_days, 15)
    INTO v_payment_terms_days
    FROM public.organizations
   WHERE id = v_quote.org_id;

  v_payment_terms_days := GREATEST(COALESCE(v_payment_terms_days, 15), 0);

  INSERT INTO public.invoices (
    org_id,
    client_id,
    issue_date,
    due_date,
    status,
    notes
  )
  VALUES (
    v_quote.org_id,
    v_quote.client_id,
    CURRENT_DATE,
    COALESCE(p_due_date, CURRENT_DATE + v_payment_terms_days),
    'pending',
    v_quote.notes
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT *
      FROM public.quotation_items
     WHERE quotation_id = v_quote.id
       AND org_id = v_quote.org_id
     ORDER BY position, created_at, id
  LOOP
    INSERT INTO public.invoice_items (
      org_id,
      invoice_id,
      position,
      product_id,
      description,
      hsn_sac,
      unit,
      quantity,
      unit_price,
      discount_pct,
      gst_rate
    )
    VALUES (
      v_quote.org_id,
      v_invoice_id,
      v_position,
      v_item.product_id,
      v_item.description,
      v_item.hsn_sac,
      COALESCE(NULLIF(v_item.unit, ''), 'unit'),
      v_item.quantity,
      v_item.unit_price,
      COALESCE(v_item.discount_pct, 0),
      COALESCE(v_item.gst_rate, 0)
    );
    v_position := v_position + 1;
  END LOOP;

  IF v_position = 0 THEN
    RAISE EXCEPTION 'Cannot convert a quotation with no line items.';
  END IF;

  UPDATE public.quotations
     SET status = 'converted'
   WHERE id = v_quote.id
     AND org_id = v_quote.org_id
     AND lower(status) = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while it was being converted.';
  END IF;

  RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  TO authenticated;
