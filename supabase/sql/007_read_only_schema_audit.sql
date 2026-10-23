-- LedgerFlow read-only schema/security inventory.
-- SELECT statements only: no database rows or schema objects are changed.

-- 1. Tables and RLS settings
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.relrowsecurity AS rls_enabled, c.relforcerowsecurity AS rls_forced
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
  AND c.relname IN ('organizations','org_members','clients','products','invoices','invoice_items','quotations','quotation_items','payments','document_share_tokens','document_signatures','invoice_reminder_log','organization_reminder_settings','audit_log','document_counters')
ORDER BY c.relname;

-- 2. RLS policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies WHERE schemaname = 'public'
  AND tablename IN ('organizations','org_members','clients','products','invoices','invoice_items','quotations','quotation_items','payments','document_share_tokens','document_signatures','invoice_reminder_log','organization_reminder_settings','audit_log','document_counters')
ORDER BY tablename, policyname;

-- 3. Financial and organization-related columns
SELECT table_name, ordinal_position, column_name, data_type, is_nullable, column_default
FROM information_schema.columns WHERE table_schema = 'public'
  AND table_name IN ('organizations','org_members','clients','products','invoices','invoice_items','quotations','quotation_items','payments','document_share_tokens','document_signatures','invoice_reminder_log','organization_reminder_settings')
ORDER BY table_name, ordinal_position;

-- 4. Triggers
SELECT event_object_table AS table_name, trigger_name, event_manipulation, action_timing, action_orientation, action_statement
FROM information_schema.triggers WHERE trigger_schema = 'public'
  AND event_object_table IN ('invoices','invoice_items','quotations','quotation_items','payments')
ORDER BY event_object_table, trigger_name, event_manipulation;

-- 5. Relevant functions (definitions included for review)
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer, p.proconfig AS function_settings,
       pg_get_functiondef(p.oid) AS definition
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('save_invoice_with_items','save_quotation_with_items','convert_quotation_to_invoice','payment_before','payment_after','enforce_invoice_payment_integrity','audit_trigger')
ORDER BY p.proname;