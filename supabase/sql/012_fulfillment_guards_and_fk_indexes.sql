-- Prevent direct authenticated clients from bypassing stock reservation and dispatch.
-- The application now generates the tax invoice through the server-side sales-order workflow.
REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date)
  FROM PUBLIC, anon, authenticated, service_role;

-- Missing covering indexes reported by Supabase's live performance advisor.
CREATE INDEX IF NOT EXISTS idx_clients_org_id_fk ON public.clients (org_id);
CREATE INDEX IF NOT EXISTS idx_document_signatures_updated_by_fk ON public.document_signatures (updated_by);
CREATE INDEX IF NOT EXISTS idx_invitations_invited_by_fk ON public.invitations (invited_by);
CREATE INDEX IF NOT EXISTS idx_invitations_org_id_fk ON public.invitations (org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id_fk ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_org_id_fk ON public.invoice_items (org_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product_id_fk ON public.invoice_items (product_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminder_log_org_id_fk ON public.invoice_reminder_log (org_id);
CREATE INDEX IF NOT EXISTS idx_invoices_created_by_fk ON public.invoices (created_by);
CREATE INDEX IF NOT EXISTS idx_invoices_quotation_id_fk ON public.invoices (quotation_id);
CREATE INDEX IF NOT EXISTS idx_invoices_sales_order_id_fk ON public.invoices (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user_id_fk ON public.org_members (user_id);
CREATE INDEX IF NOT EXISTS idx_organization_reminder_settings_enabled_by_fk ON public.organization_reminder_settings (enabled_by);
CREATE INDEX IF NOT EXISTS idx_organizations_created_by_fk ON public.organizations (created_by);
CREATE INDEX IF NOT EXISTS idx_payments_org_id_fk ON public.payments (org_id);
CREATE INDEX IF NOT EXISTS idx_payments_recorded_by_fk ON public.payments (recorded_by);
CREATE INDEX IF NOT EXISTS idx_quotation_items_org_id_fk ON public.quotation_items (org_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_product_id_fk ON public.quotation_items (product_id);
CREATE INDEX IF NOT EXISTS idx_quotation_items_quotation_id_fk ON public.quotation_items (quotation_id);
CREATE INDEX IF NOT EXISTS idx_quotations_client_id_fk ON public.quotations (client_id);
CREATE INDEX IF NOT EXISTS idx_quotations_created_by_fk ON public.quotations (created_by);
CREATE INDEX IF NOT EXISTS idx_quotations_invoice_id_fk ON public.quotations (invoice_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_product_id_fk ON public.sales_order_items (product_id);
CREATE INDEX IF NOT EXISTS idx_sales_order_items_sales_order_id_fk ON public.sales_order_items (sales_order_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_client_id_fk ON public.sales_orders (client_id);
CREATE INDEX IF NOT EXISTS idx_sales_orders_quotation_id_fk ON public.sales_orders (quotation_id);
