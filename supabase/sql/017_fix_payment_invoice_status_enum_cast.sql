-- Migration 017: cast invoice_status to text before COALESCE in payment validation.
-- Without the cast PostgreSQL tries to interpret '' as an invoice_status enum member.
CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_balance numeric;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.'
      USING ERRCODE = '23514';
  END IF;

  -- Lock the invoice row to serialize concurrent payment inserts for this invoice.
  SELECT *
    INTO v_invoice
    FROM public.invoices
   WHERE id = NEW.invoice_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.'
      USING ERRCODE = '23503';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_invoice.org_id;
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

  -- Critical fix: cast enum to text before COALESCE.
  IF lower(COALESCE(v_invoice.status::text, '')) IN ('draft', 'cancelled', 'paid') THEN
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
$function$;
