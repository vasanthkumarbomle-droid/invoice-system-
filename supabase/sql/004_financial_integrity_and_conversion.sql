-- Migration 004: safe quotation conversion, payment guardrails, and persisted bank account holder.
-- Prerequisite: the LedgerFlow core tables created in the existing Supabase project must exist.
-- This is an additive migration; it does not fabricate or replace the project's unknown core schema.

ALTER TABLE public.organizations
    ADD COLUMN IF NOT EXISTS bank_account_holder text;

-- Convert an accepted quotation exactly once. The row lock serializes concurrent conversion
-- attempts; changing the quotation to "converted" and inserting the invoice/items is atomic.
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
    v_invoice_id uuid;
    v_issue_date date := (timezone('Asia/Kolkata', now()))::date;
    v_payment_terms_days integer := 15;
    v_item_count integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'You must be signed in to convert a quotation.'
            USING ERRCODE = '42501';
    END IF;

    SELECT q.*
      INTO v_quote
      FROM public.quotations AS q
     WHERE q.id = p_quote_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation not found.'
            USING ERRCODE = 'P0002';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.org_members AS member
         WHERE member.org_id = v_quote.org_id
           AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You are not a member of this quotation''s organization.'
            USING ERRCODE = '42501';
    END IF;

    IF lower(COALESCE(v_quote.status, '')) <> 'accepted' THEN
        RAISE EXCEPTION 'Only an accepted quotation can be converted.'
            USING ERRCODE = '23514';
    END IF;

    IF NOT EXISTS (
        SELECT 1
          FROM public.clients AS client
         WHERE client.id = v_quote.client_id
           AND client.org_id = v_quote.org_id
    ) THEN
        RAISE EXCEPTION 'The quotation client does not belong to the same organization.'
            USING ERRCODE = '23514';
    END IF;

    SELECT COUNT(*)
      INTO v_item_count
      FROM public.quotation_items AS item
     WHERE item.org_id = v_quote.org_id
       AND item.quotation_id = v_quote.id;

    IF v_item_count = 0 THEN
        RAISE EXCEPTION 'The quotation has no line items to convert.'
            USING ERRCODE = '23514';
    END IF;

    SELECT GREATEST(0, LEAST(COALESCE(org.default_payment_terms_days, 15), 3650))
      INTO v_payment_terms_days
      FROM public.organizations AS org
     WHERE org.id = v_quote.org_id;

    v_payment_terms_days := COALESCE(v_payment_terms_days, 15);

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
        v_issue_date,
        COALESCE(p_due_date, v_issue_date + v_payment_terms_days),
        'pending',
        v_quote.notes
    )
    RETURNING id INTO v_invoice_id;

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
    SELECT
        item.org_id,
        v_invoice_id,
        (row_number() OVER (ORDER BY item.position, item.id) - 1)::integer,
        item.product_id,
        item.description,
        item.hsn_sac,
        item.unit,
        item.quantity,
        item.unit_price,
        item.discount_pct,
        item.gst_rate
      FROM public.quotation_items AS item
     WHERE item.org_id = v_quote.org_id
       AND item.quotation_id = v_quote.id;

    UPDATE public.quotations
       SET status = 'converted'
     WHERE id = v_quote.id
       AND org_id = v_quote.org_id
       AND lower(status) = 'accepted';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Quotation status changed during conversion; no invoice was created.'
            USING ERRCODE = '40001';
    END IF;

    RETURN v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_quotation_to_invoice(uuid, date) TO authenticated;

-- Validate every new payment in the database as well as in the UI. This prevents invalid
-- requests from bypassing the form and locks the invoice row so simultaneous payments cannot
-- both spend the same outstanding balance. Existing payment-summary triggers remain in place.
CREATE OR REPLACE FUNCTION public.guard_invoice_payment_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_org_id uuid;
    v_status text;
    v_balance_due numeric;
BEGIN
    IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero.'
            USING ERRCODE = '23514';
    END IF;

    SELECT invoice.org_id, invoice.status, invoice.balance_due
      INTO v_org_id, v_status, v_balance_due
      FROM public.invoices AS invoice
     WHERE invoice.id = NEW.invoice_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice for this payment was not found.'
            USING ERRCODE = '23503';
    END IF;

    IF NEW.org_id IS DISTINCT FROM v_org_id THEN
        RAISE EXCEPTION 'Payment organization must match the invoice organization.'
            USING ERRCODE = '23514';
    END IF;

    IF auth.uid() IS NOT NULL AND NOT EXISTS (
        SELECT 1
          FROM public.org_members AS member
         WHERE member.org_id = v_org_id
           AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You are not allowed to record a payment for this organization.'
            USING ERRCODE = '42501';
    END IF;

    IF lower(COALESCE(v_status, '')) IN ('draft', 'cancelled', 'paid')
       OR COALESCE(v_balance_due, 0) <= 0 THEN
        RAISE EXCEPTION 'Payments can only be recorded against an issued invoice with an outstanding balance.'
            USING ERRCODE = '23514';
    END IF;

    IF round(NEW.amount::numeric, 2) > COALESCE(v_balance_due, 0) + 0.005 THEN
        RAISE EXCEPTION 'Payment exceeds the invoice outstanding balance.'
            USING ERRCODE = '23514';
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_invoice_payment_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS guard_invoice_payment_insert_trigger ON public.payments;
CREATE TRIGGER guard_invoice_payment_insert_trigger
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.guard_invoice_payment_insert();
