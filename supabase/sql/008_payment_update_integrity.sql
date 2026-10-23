-- Migration 008: validate payment updates and keep invoice balances consistent.
-- Review against the live schema before applying in Supabase SQL Editor.
-- This migration does not change RLS policies or existing audit triggers.

CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_update_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_paid numeric(14,2);
  v_balance numeric(14,2);
  v_lock_id uuid;
BEGIN
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.'
      USING ERRCODE = '23514';
  END IF;

  IF NEW.invoice_id IS NULL THEN
    RAISE EXCEPTION 'Payment must reference an invoice.'
      USING ERRCODE = '23503';
  END IF;

  -- Lock both affected invoices in a stable order to reduce deadlock risk when
  -- a payment is moved between invoices. Inserts are already serialized by 005.
  FOR v_lock_id IN
    SELECT DISTINCT ids.id
    FROM unnest(ARRAY[OLD.invoice_id, NEW.invoice_id]) AS ids(id)
    WHERE ids.id IS NOT NULL
    ORDER BY ids.id
  LOOP
    PERFORM 1
    FROM public.invoices
    WHERE id = v_lock_id
    FOR UPDATE;
  END LOOP;

  SELECT *
    INTO v_invoice
    FROM public.invoices
   WHERE id = NEW.invoice_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice not found.'
      USING ERRCODE = '23503';
  END IF;

  -- The payment organization must always match the destination invoice.
  NEW.org_id := v_invoice.org_id;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
      FROM public.org_members AS member
     WHERE member.org_id = v_invoice.org_id
       AND member.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'You are not allowed to update payments for this organization.'
      USING ERRCODE = '42501';
  END IF;

  IF lower(COALESCE(v_invoice.status::text, '')) IN ('draft', 'cancelled') THEN
    RAISE EXCEPTION 'Payments cannot be assigned to draft or cancelled invoices.'
      USING ERRCODE = '23514';
  END IF;

  -- A fully paid invoice may need a payment corrected downward. Do not allow
  -- adding/increasing a payment on a paid invoice or moving another payment onto it.
  IF lower(COALESCE(v_invoice.status::text, '')) = 'paid'
     AND (
       NEW.invoice_id IS DISTINCT FROM OLD.invoice_id
       OR NEW.amount > OLD.amount
     ) THEN
    RAISE EXCEPTION 'Payments cannot be increased or moved onto a paid invoice.'
      USING ERRCODE = '23514';
  END IF;

  -- Recompute from payment rows rather than trusting a possibly stale balance_due.
  -- Exclude this row so its old amount does not count against the new amount.
  SELECT COALESCE(SUM(p.amount), 0)
    INTO v_paid
    FROM public.payments AS p
   WHERE p.invoice_id = NEW.invoice_id
     AND p.id <> OLD.id;

  v_balance := GREATEST(0, COALESCE(v_invoice.grand_total, 0) - v_paid);

  IF ROUND(NEW.amount::numeric, 2) > ROUND(v_balance, 2) THEN
    RAISE EXCEPTION 'Payment amount exceeds the invoice outstanding balance.'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_invoice_payment_update_integrity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_invoice_payment_update_integrity_before_update
  ON public.payments;

CREATE TRIGGER enforce_invoice_payment_update_integrity_before_update
BEFORE UPDATE OF invoice_id, org_id, amount ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_invoice_payment_update_integrity();


-- Refresh both invoice balances when a payment is moved. Keep the existing
-- audit_payments trigger untouched.
CREATE OR REPLACE FUNCTION public.payment_after()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.invoice_refresh(OLD.invoice_id);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.invoice_id IS DISTINCT FROM NEW.invoice_id THEN
      PERFORM public.invoice_refresh(OLD.invoice_id);
    END IF;
    PERFORM public.invoice_refresh(NEW.invoice_id);
  ELSE
    PERFORM public.invoice_refresh(NEW.invoice_id);
  END IF;

  RETURN NULL;
END;
$$;

-- Guard against negative balances if pre-existing payment data is inconsistent.
CREATE OR REPLACE FUNCTION public.invoice_refresh(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  paid numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(amount), 0)
    INTO paid
    FROM public.payments
   WHERE invoice_id = p_id;

  UPDATE public.invoices
     SET amount_paid = paid,
         balance_due = GREATEST(0, COALESCE(grand_total, 0) - paid),
         status = CASE
           WHEN status IN ('draft', 'cancelled') THEN status
           WHEN grand_total > 0 AND paid >= grand_total THEN 'paid'::invoice_status
           WHEN paid > 0 THEN 'partially_paid'::invoice_status
           WHEN due_date < CURRENT_DATE THEN 'overdue'::invoice_status
           ELSE 'pending'::invoice_status
         END
   WHERE id = p_id;
END;
$$;
