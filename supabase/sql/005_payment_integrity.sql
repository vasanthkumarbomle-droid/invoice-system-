-- Migration 005: validate received payments at the database boundary.
-- Apply in the Supabase SQL Editor after the core payments/invoices schema exists.
-- The UI validation is convenience only; this trigger also protects direct API calls.

CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_balance numeric;
BEGIN
  SELECT *
    INTO v_invoice
    FROM public.invoices
   WHERE id = NEW.invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_invoice.org_id THEN
    RAISE EXCEPTION 'Payment organization does not match the invoice organization.';
  END IF;

  IF lower(COALESCE(v_invoice.status, '')) IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Payments cannot be recorded against draft or cancelled invoices.';
  END IF;

  v_balance := COALESCE(
    v_invoice.balance_due,
    COALESCE(v_invoice.grand_total, 0) - COALESCE(v_invoice.amount_paid, 0)
  );

  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF ROUND(NEW.amount::numeric, 2) > ROUND(COALESCE(v_balance, 0), 2) THEN
    RAISE EXCEPTION 'Payment amount exceeds the invoice outstanding balance.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_invoice_payment_integrity_before_insert
  ON public.payments;

CREATE TRIGGER enforce_invoice_payment_integrity_before_insert
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_payment_integrity();
