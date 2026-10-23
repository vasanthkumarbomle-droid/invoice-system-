-- Migration 006: allow a separately deduplicated reminder on the actual invoice due date.
-- Apply before deploying the Edge Function version that emits reminder_type = 'due_today'.

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT constraint_name.conname
      FROM pg_constraint AS constraint_name
     WHERE constraint_name.conrelid = 'public.invoice_reminder_log'::regclass
       AND constraint_name.contype = 'c'
       AND pg_get_constraintdef(constraint_name.oid) ILIKE '%reminder_type%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.invoice_reminder_log DROP CONSTRAINT %I',
      constraint_row.conname
    );
  END LOOP;
END;
$$;

ALTER TABLE public.invoice_reminder_log
  ADD CONSTRAINT invoice_reminder_log_reminder_type_check
  CHECK (reminder_type IN ('due_soon', 'due_today', 'overdue'));

COMMENT ON COLUMN public.invoice_reminder_log.reference_date IS
  'For due_soon and due_today this is the invoice due date; for overdue this is the send/run date.';
