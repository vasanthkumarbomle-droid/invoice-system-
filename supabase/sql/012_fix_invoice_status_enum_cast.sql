-- Fix invoice status enum casts after the Indian billing adjustments migration.
-- The save function must cast the validated text status for both INSERT and UPDATE.
-- This patch intentionally changes no business rows.
DO $migration$
DECLARE
  v_definition text;
  v_insert text := E'            v_requested_status,\n';
  v_update text := E'            status = v_requested_status,\n';
BEGIN
  SELECT pg_get_functiondef(
    'public.save_invoice_with_items(uuid,uuid,jsonb,jsonb)'::regprocedure
  )
  INTO v_definition;

  IF position(v_insert IN v_definition) = 0
     AND position('v_requested_status::public.invoice_status' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected invoice INSERT status expression was not found; refusing to patch.';
  END IF;

  IF position(v_update IN v_definition) = 0
     AND position('status = v_requested_status::public.invoice_status' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Expected invoice UPDATE status expression was not found; refusing to patch.';
  END IF;

  v_definition := replace(
    v_definition,
    v_insert,
    E'            v_requested_status::public.invoice_status,\n'
  );
  v_definition := replace(
    v_definition,
    v_update,
    E'            status = v_requested_status::public.invoice_status,\n'
  );

  IF position('v_requested_status::public.invoice_status' IN v_definition) = 0
     OR position('status = v_requested_status::public.invoice_status' IN v_definition) = 0 THEN
    RAISE EXCEPTION 'Invoice enum cast verification failed; refusing to replace the function.';
  END IF;

  EXECUTE v_definition;
END
$migration$;
