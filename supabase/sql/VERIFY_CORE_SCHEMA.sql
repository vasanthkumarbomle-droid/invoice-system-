-- Read-only schema audit for an existing LedgerFlow Supabase project.
-- Run in Supabase SQL Editor. Rows marked available=false need investigation before deployment.

WITH required_columns(table_name, column_name) AS (
  VALUES
    ('organizations','id'),
    ('organizations','name'),
    ('organizations','legal_name'),
    ('organizations','gstin'),
    ('organizations','pan'),
    ('organizations','state_code'),
    ('organizations','email'),
    ('organizations','phone'),
    ('organizations','address'),
    ('organizations','website'),
    ('organizations','invoice_prefix'),
    ('organizations','quote_prefix'),
    ('organizations','default_gst_rate'),
    ('organizations','default_payment_terms_days'),
    ('organizations','bank_name'),
    ('organizations','bank_account_no'),
    ('organizations','bank_ifsc'),
    ('organizations','upi_id'),
    ('organizations','terms'),
    ('org_members','org_id'),
    ('org_members','user_id'),
    ('org_members','role'),
    ('clients','id'),
    ('clients','org_id'),
    ('clients','name'),
    ('clients','contact_person'),
    ('clients','email'),
    ('clients','phone'),
    ('clients','gstin'),
    ('clients','state_code'),
    ('clients','address'),
    ('clients','deleted_at'),
    ('products','id'),
    ('products','org_id'),
    ('products','name'),
    ('products','sku'),
    ('products','barcode'),
    ('products','hsn_sac'),
    ('products','category'),
    ('products','price'),
    ('products','gst_rate'),
    ('products','stock_qty'),
    ('products','description'),
    ('products','deleted_at'),
    ('invoices','id'),
    ('invoices','org_id'),
    ('invoices','client_id'),
    ('invoices','invoice_number'),
    ('invoices','issue_date'),
    ('invoices','due_date'),
    ('invoices','status'),
    ('invoices','subtotal'),
    ('invoices','amount_paid'),
    ('invoices','balance_due'),
    ('invoices','cgst_total'),
    ('invoices','sgst_total'),
    ('invoices','igst_total'),
    ('invoices','tax_total'),
    ('invoices','grand_total'),
    ('invoices','notes'),
    ('invoice_items','id'),
    ('invoice_items','org_id'),
    ('invoice_items','invoice_id'),
    ('invoice_items','position'),
    ('invoice_items','product_id'),
    ('invoice_items','description'),
    ('invoice_items','hsn_sac'),
    ('invoice_items','unit'),
    ('invoice_items','quantity'),
    ('invoice_items','unit_price'),
    ('invoice_items','discount_pct'),
    ('invoice_items','gst_rate'),
    ('invoice_items','taxable_amount'),
    ('invoice_items','cgst_amount'),
    ('invoice_items','sgst_amount'),
    ('invoice_items','igst_amount'),
    ('invoice_items','tax_amount'),
    ('invoice_items','line_total'),
    ('payments','id'),
    ('payments','org_id'),
    ('payments','invoice_id'),
    ('payments','amount'),
    ('payments','method'),
    ('payments','reference'),
    ('payments','notes'),
    ('payments','paid_at'),
    ('quotations','id'),
    ('quotations','org_id'),
    ('quotations','client_id'),
    ('quotations','quote_number'),
    ('quotations','issue_date'),
    ('quotations','valid_until'),
    ('quotations','status'),
    ('quotations','subtotal'),
    ('quotations','cgst_total'),
    ('quotations','sgst_total'),
    ('quotations','igst_total'),
    ('quotations','tax_total'),
    ('quotations','grand_total'),
    ('quotations','notes'),
    ('quotations','terms'),
    ('quotation_items','id'),
    ('quotation_items','org_id'),
    ('quotation_items','quotation_id'),
    ('quotation_items','position'),
    ('quotation_items','product_id'),
    ('quotation_items','description'),
    ('quotation_items','hsn_sac'),
    ('quotation_items','unit'),
    ('quotation_items','quantity'),
    ('quotation_items','unit_price'),
    ('quotation_items','discount_pct'),
    ('quotation_items','gst_rate'),
    ('quotation_items','taxable_amount'),
    ('quotation_items','cgst_amount'),
    ('quotation_items','sgst_amount'),
    ('quotation_items','igst_amount'),
    ('quotation_items','tax_amount'),
    ('quotation_items','line_total')
)
SELECT
  required_columns.table_name,
  required_columns.column_name,
  (columns.column_name IS NOT NULL) AS available
FROM required_columns
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = required_columns.table_name
 AND columns.column_name = required_columns.column_name
ORDER BY required_columns.table_name, required_columns.column_name;

-- Every organization-scoped business table must have carefully scoped RLS policies.
-- This summary lists whether RLS is enabled and how many policies are present per table.
WITH business_tables(table_name) AS (
  VALUES
    ('organizations'),
    ('org_members'),
    ('clients'),
    ('products'),
    ('invoices'),
    ('invoice_items'),
    ('payments'),
    ('quotations'),
    ('quotation_items'),
    ('document_share_tokens'),
    ('document_signatures'),
    ('invoice_reminder_log'),
    ('organization_reminder_settings')
)
SELECT
  business_tables.table_name,
  (class.oid IS NOT NULL) AS table_exists,
  CASE WHEN class.oid IS NULL THEN NULL ELSE class.relrowsecurity END AS rls_enabled,
  COUNT(policy.policyname)::integer AS policy_count
FROM business_tables
LEFT JOIN pg_namespace AS namespace
  ON namespace.nspname = 'public'
LEFT JOIN pg_class AS class
  ON class.relnamespace = namespace.oid
 AND class.relname = business_tables.table_name
 AND class.relkind IN ('r', 'p')
LEFT JOIN pg_policies AS policy
  ON policy.schemaname = 'public'
 AND policy.tablename = business_tables.table_name
GROUP BY business_tables.table_name, class.oid, class.relrowsecurity
ORDER BY business_tables.table_name;
