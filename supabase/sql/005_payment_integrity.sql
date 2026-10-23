-- Migration 005: validate received payments at the database boundary.
-- Apply after the core payments/invoices schema exists. UI validation is convenience only.

CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_balance numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.'
      USING ERRCODE = '23514';
  END IF;

  SELECT *
    INTO v_invoice
    FROM public.invoices
   WHERE id = NEW.invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.org_id IS DISTINCT FROM v_invoice.org_id THEN
    RAISE EXCEPTION 'Payment organization does not match the invoice organization.'
      USING ERRCODE = '23514';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.org_members AS member
     WHERE member.org_id = v_invoice.org_id
       AND member.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not allowed to record a payment for this organization.'
      USING ERRCODE = '42501';
  END IF;

  IF lower(COALESCE(v_invoice.status, '')) IN ('draft', 'cancelled', 'paid') THEN
    RAISE EXCEPTION 'Payments cannot be recorded against draft, cancelled or paid invoices.'
      USING ERRCODE = '23514';
  END IF;

  v_balance := COALESCE(
    v_invoice.balance_due,
    COALESCE(v_invoice.grand_total, 0) - COALESCE(v_invoice.amount_paid, 0)
  );

  IF COALESCE(v_balance, 0) <= 0 THEN
    RAISE EXCEPTION 'Invoice has no outstanding balance.'
      USING ERRCODE = '23514';
  END IF;

  IF ROUND(NEW.amount::numeric, 2) > ROUND(v_balance, 2) THEN
    RAISE EXCEPTION 'Payment amount exceeds the invoice outstanding balance.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invoice_payment_integrity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_invoice_payment_integrity_before_insert
  ON public.payments;

CREATE TRIGGER enforce_invoice_payment_integrity_before_insert
BEFORE INSERT ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_payment_integrity();
