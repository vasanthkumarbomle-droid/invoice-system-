-- BASELINE SNAPSHOT: generated from the connected LedgerFlow Supabase public schema on 2026-10-25.
-- This is a schema-only bootstrap for a NEW/EMPTY Supabase project; it contains no row data.
-- Do NOT run this file against an existing production database. Use numbered additive migrations there.
-- Review environment-specific grants/extensions and test restore in a disposable project before relying on it.
SET search_path = public, extensions, auth;

-- Extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

-- Enum types
CREATE TYPE public.invoice_status AS ENUM ('draft', 'pending', 'partially_paid', 'paid', 'overdue', 'cancelled');
CREATE TYPE public.member_role AS ENUM ('owner', 'admin', 'staff', 'accountant');
CREATE TYPE public.payment_method AS ENUM ('cash', 'upi', 'card', 'bank_transfer', 'cheque', 'online', 'other');
CREATE TYPE public.quotation_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');

-- Sequences used by non-identity columns

-- Tables and columns
CREATE TABLE public.audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  org_id uuid,
  user_id uuid DEFAULT auth.uid(),
  table_name text NOT NULL,
  record_id text,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.clients (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  name text NOT NULL,
  company text,
  email text,
  phone text,
  gstin text,
  address text,
  state_code text,
  payment_terms_days integer,
  credit_limit numeric(14,2),
  tags text[] DEFAULT '{}'::text[],
  notes text,
  is_active boolean DEFAULT true NOT NULL,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  contact_person text
);
CREATE TABLE public.document_counters (
  org_id uuid NOT NULL,
  doc_type text NOT NULL,
  year integer NOT NULL,
  last_number integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.document_share_tokens (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  document_type text NOT NULL,
  document_id uuid NOT NULL,
  token_hash text NOT NULL,
  recipient_email text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  response_status text,
  responded_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.document_signatures (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  document_type text NOT NULL,
  document_id uuid NOT NULL,
  signature_data text NOT NULL,
  updated_by uuid,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.invitations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  email text NOT NULL,
  role member_role DEFAULT 'staff'::member_role NOT NULL,
  token uuid DEFAULT gen_random_uuid() NOT NULL,
  invited_by uuid DEFAULT auth.uid(),
  expires_at timestamp with time zone DEFAULT (now() + '7 days'::interval) NOT NULL,
  accepted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.invoice_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  invoice_id uuid NOT NULL,
  org_id uuid NOT NULL,
  product_id uuid,
  "position" integer DEFAULT 0 NOT NULL,
  description text NOT NULL,
  hsn_sac text,
  unit text DEFAULT 'pcs'::text,
  quantity numeric(14,3) DEFAULT 1 NOT NULL,
  unit_price numeric(14,2) DEFAULT 0 NOT NULL,
  discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
  gst_rate numeric(5,2) DEFAULT 18 NOT NULL,
  taxable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  cgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  sgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  igst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  line_total numeric(14,2) DEFAULT 0 NOT NULL
);
CREATE TABLE public.invoice_reminder_log (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  reminder_type text NOT NULL,
  reference_date date NOT NULL,
  recipient_email text NOT NULL,
  provider_message_id text,
  sent_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.invoices (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  quotation_id uuid,
  invoice_number text,
  status invoice_status DEFAULT 'draft'::invoice_status NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  due_date date DEFAULT (CURRENT_DATE + 15) NOT NULL,
  is_interstate boolean DEFAULT false NOT NULL,
  subtotal numeric(14,2) DEFAULT 0 NOT NULL,
  cgst_total numeric(14,2) DEFAULT 0 NOT NULL,
  sgst_total numeric(14,2) DEFAULT 0 NOT NULL,
  igst_total numeric(14,2) DEFAULT 0 NOT NULL,
  tax_total numeric(14,2) DEFAULT 0 NOT NULL,
  grand_total numeric(14,2) DEFAULT 0 NOT NULL,
  amount_paid numeric(14,2) DEFAULT 0 NOT NULL,
  balance_due numeric(14,2) DEFAULT 0 NOT NULL,
  notes text,
  terms text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  sales_order_id uuid,
  discount_type text DEFAULT 'percentage'::text NOT NULL,
  discount_value numeric(14,2) DEFAULT 0 NOT NULL,
  shipping_charge numeric(14,2) DEFAULT 0 NOT NULL,
  round_off_mode text DEFAULT 'manual'::text NOT NULL,
  round_off_value numeric(14,2) DEFAULT 0 NOT NULL,
  round_off_amount numeric(14,2) DEFAULT 0 NOT NULL,
  tds_rate numeric(5,2) DEFAULT 0 NOT NULL,
  tds_amount numeric(14,2) DEFAULT 0 NOT NULL,
  tcs_rate numeric(5,2) DEFAULT 0 NOT NULL,
  tcs_amount numeric(14,2) DEFAULT 0 NOT NULL
);
CREATE TABLE public.org_members (
  org_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role member_role DEFAULT 'staff'::member_role NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.organization_reminder_settings (
  org_id uuid NOT NULL,
  enabled boolean DEFAULT false NOT NULL,
  shared_sender_acknowledged boolean DEFAULT false NOT NULL,
  enabled_by uuid,
  enabled_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  reminder_schedule text DEFAULT '3_days_before'::text NOT NULL
);
CREATE TABLE public.organizations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  name text NOT NULL,
  legal_name text,
  logo_url text,
  brand_color text DEFAULT '#1e40af'::text,
  gstin text,
  pan text,
  state_code text,
  address text,
  phone text,
  email text,
  website text,
  currency text DEFAULT 'INR'::text NOT NULL,
  default_gst_rate numeric(5,2) DEFAULT 18 NOT NULL,
  default_payment_terms_days integer DEFAULT 15 NOT NULL,
  invoice_prefix text DEFAULT 'INV'::text NOT NULL,
  quote_prefix text DEFAULT 'QUO'::text NOT NULL,
  terms text,
  bank_name text,
  bank_account_no text,
  bank_ifsc text,
  upi_id text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  bank_account_holder text
);
CREATE TABLE public.payments (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  amount numeric(14,2) NOT NULL,
  method payment_method DEFAULT 'upi'::payment_method NOT NULL,
  reference text,
  paid_at date DEFAULT CURRENT_DATE NOT NULL,
  notes text,
  recorded_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.products (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  kind text DEFAULT 'product'::text NOT NULL,
  name text NOT NULL,
  sku text,
  barcode text,
  hsn_sac text,
  unit text DEFAULT 'pcs'::text NOT NULL,
  price numeric(14,2) DEFAULT 0 NOT NULL,
  cost_price numeric(14,2) DEFAULT 0,
  gst_rate numeric(5,2) DEFAULT 18 NOT NULL,
  stock_qty numeric(14,2) DEFAULT 0 NOT NULL,
  low_stock_threshold numeric(14,2) DEFAULT 0,
  is_active boolean DEFAULT true NOT NULL,
  deleted_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  category text DEFAULT 'Hardware'::text,
  description text
);
CREATE TABLE public.quotation_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  quotation_id uuid NOT NULL,
  org_id uuid NOT NULL,
  product_id uuid,
  "position" integer DEFAULT 0 NOT NULL,
  description text NOT NULL,
  hsn_sac text,
  unit text DEFAULT 'pcs'::text,
  quantity numeric(14,3) DEFAULT 1 NOT NULL,
  unit_price numeric(14,2) DEFAULT 0 NOT NULL,
  discount_pct numeric(5,2) DEFAULT 0 NOT NULL,
  gst_rate numeric(5,2) DEFAULT 18 NOT NULL,
  taxable_amount numeric(14,2) DEFAULT 0 NOT NULL,
  cgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  sgst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  igst_amount numeric(14,2) DEFAULT 0 NOT NULL,
  line_total numeric(14,2) DEFAULT 0 NOT NULL
);
CREATE TABLE public.quotations (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  client_id uuid NOT NULL,
  quote_number text,
  status quotation_status DEFAULT 'draft'::quotation_status NOT NULL,
  issue_date date DEFAULT CURRENT_DATE NOT NULL,
  valid_until date DEFAULT (CURRENT_DATE + 15),
  is_interstate boolean DEFAULT false NOT NULL,
  subtotal numeric(14,2) DEFAULT 0 NOT NULL,
  cgst_total numeric(14,2) DEFAULT 0 NOT NULL,
  sgst_total numeric(14,2) DEFAULT 0 NOT NULL,
  igst_total numeric(14,2) DEFAULT 0 NOT NULL,
  tax_total numeric(14,2) DEFAULT 0 NOT NULL,
  grand_total numeric(14,2) DEFAULT 0 NOT NULL,
  invoice_id uuid,
  notes text,
  terms text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  discount_type text DEFAULT 'percentage'::text NOT NULL,
  discount_value numeric(14,2) DEFAULT 0 NOT NULL,
  shipping_charge numeric(14,2) DEFAULT 0 NOT NULL,
  round_off_mode text DEFAULT 'manual'::text NOT NULL,
  round_off_value numeric(14,2) DEFAULT 0 NOT NULL,
  round_off_amount numeric(14,2) DEFAULT 0 NOT NULL,
  tds_rate numeric(5,2) DEFAULT 0 NOT NULL,
  tds_amount numeric(14,2) DEFAULT 0 NOT NULL,
  tcs_rate numeric(5,2) DEFAULT 0 NOT NULL,
  tcs_amount numeric(14,2) DEFAULT 0 NOT NULL
);
CREATE TABLE public.sales_order_counters (
  org_id uuid NOT NULL,
  year integer NOT NULL,
  last_number integer DEFAULT 0 NOT NULL
);
CREATE TABLE public.sales_order_items (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  product_id uuid,
  sku text,
  description text NOT NULL,
  hsn_sac text,
  unit text DEFAULT 'pcs'::text,
  quantity numeric NOT NULL,
  unit_price numeric NOT NULL,
  discount_pct numeric DEFAULT 0 NOT NULL,
  gst_rate numeric DEFAULT 0 NOT NULL,
  "position" integer DEFAULT 0 NOT NULL,
  reserved_qty numeric DEFAULT 0 NOT NULL,
  stock_status text DEFAULT 'manual_check'::text NOT NULL,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL
);
CREATE TABLE public.sales_orders (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  org_id uuid NOT NULL,
  quotation_id uuid NOT NULL,
  client_id uuid NOT NULL,
  order_number text NOT NULL,
  status text DEFAULT 'awaiting_stock'::text NOT NULL,
  stock_status text DEFAULT 'manual_check'::text NOT NULL,
  payment_type text DEFAULT 'credit'::text NOT NULL,
  payment_terms text,
  advance_paid boolean DEFAULT false NOT NULL,
  carrier text,
  tracking_number text,
  shipping_notes text,
  stock_reserved_at timestamp with time zone,
  packed_at timestamp with time zone,
  dispatched_at timestamp with time zone,
  stock_deducted_at timestamp with time zone,
  invoice_generated_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now() NOT NULL,
  updated_at timestamp with time zone DEFAULT now() NOT NULL,
  tracking_url text
);

-- Constraints
ALTER TABLE public.audit_log ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);
ALTER TABLE public.clients ADD CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.clients ADD CONSTRAINT clients_pkey PRIMARY KEY (id);
ALTER TABLE public.document_counters ADD CONSTRAINT document_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.document_counters ADD CONSTRAINT document_counters_pkey PRIMARY KEY (org_id, doc_type, year);
ALTER TABLE public.document_share_tokens ADD CONSTRAINT document_share_tokens_document_type_check CHECK ((document_type = ANY (ARRAY['invoice'::text, 'quotation'::text])));
ALTER TABLE public.document_share_tokens ADD CONSTRAINT document_share_tokens_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.document_share_tokens ADD CONSTRAINT document_share_tokens_pkey PRIMARY KEY (id);
ALTER TABLE public.document_share_tokens ADD CONSTRAINT document_share_tokens_response_status_check CHECK ((response_status = ANY (ARRAY['accepted'::text, 'rejected'::text])));
ALTER TABLE public.document_share_tokens ADD CONSTRAINT document_share_tokens_token_hash_key UNIQUE (token_hash);
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_document_type_check CHECK ((document_type = ANY (ARRAY['invoice'::text, 'quotation'::text])));
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_one_per_document UNIQUE (org_id, document_type, document_id);
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_pkey PRIMARY KEY (id);
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_signature_data_check CHECK (((signature_data ~~ 'data:image/png;base64,%'::text) AND (length(signature_data) <= 1000000)));
ALTER TABLE public.document_signatures ADD CONSTRAINT document_signatures_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_invited_by_fkey FOREIGN KEY (invited_by) REFERENCES auth.users(id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invitations ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);
ALTER TABLE public.invitations ADD CONSTRAINT invitations_token_key UNIQUE (token);
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric)));
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE public.invoice_items ADD CONSTRAINT invoice_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
ALTER TABLE public.invoice_reminder_log ADD CONSTRAINT invoice_reminder_log_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_reminder_log ADD CONSTRAINT invoice_reminder_log_invoice_id_reminder_type_reference_dat_key UNIQUE (invoice_id, reminder_type, reference_date);
ALTER TABLE public.invoice_reminder_log ADD CONSTRAINT invoice_reminder_log_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invoice_reminder_log ADD CONSTRAINT invoice_reminder_log_pkey PRIMARY KEY (id);
ALTER TABLE public.invoice_reminder_log ADD CONSTRAINT invoice_reminder_log_reminder_type_check CHECK ((reminder_type = ANY (ARRAY['due_soon'::text, 'due_today'::text, 'overdue'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_adjustment_rates_check CHECK (((shipping_charge >= (0)::numeric) AND (abs(round_off_value) <= (1)::numeric) AND ((tds_rate >= (0)::numeric) AND (tds_rate <= (100)::numeric)) AND ((tcs_rate >= (0)::numeric) AND (tcs_rate <= (100)::numeric))));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_discount_value_check CHECK (((discount_value >= (0)::numeric) AND ((discount_type <> 'percentage'::text) OR (discount_value <= (100)::numeric))));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_org_id_invoice_number_key UNIQUE (org_id, invoice_number);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);
ALTER TABLE public.invoices ADD CONSTRAINT invoices_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE SET NULL;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_round_off_mode_check CHECK ((round_off_mode = ANY (ARRAY['manual'::text, 'nearest_rupee'::text])));
ALTER TABLE public.invoices ADD CONSTRAINT invoices_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE RESTRICT;
ALTER TABLE public.org_members ADD CONSTRAINT org_members_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.org_members ADD CONSTRAINT org_members_pkey PRIMARY KEY (org_id, user_id);
ALTER TABLE public.org_members ADD CONSTRAINT org_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.organization_reminder_settings ADD CONSTRAINT organization_reminder_schedule_check CHECK ((reminder_schedule = ANY (ARRAY['3_days_before'::text, 'due_date'::text, '7_days_overdue'::text])));
ALTER TABLE public.organization_reminder_settings ADD CONSTRAINT organization_reminder_settings_enabled_by_fkey FOREIGN KEY (enabled_by) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.organization_reminder_settings ADD CONSTRAINT organization_reminder_settings_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.organization_reminder_settings ADD CONSTRAINT organization_reminder_settings_pkey PRIMARY KEY (org_id);
ALTER TABLE public.organization_reminder_settings ADD CONSTRAINT reminder_sender_consent_required CHECK (((NOT enabled) OR shared_sender_acknowledged));
ALTER TABLE public.organizations ADD CONSTRAINT organizations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.organizations ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_amount_check CHECK ((amount > (0)::numeric));
ALTER TABLE public.payments ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD CONSTRAINT payments_pkey PRIMARY KEY (id);
ALTER TABLE public.payments ADD CONSTRAINT payments_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES auth.users(id);
ALTER TABLE public.products ADD CONSTRAINT products_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'service'::text])));
ALTER TABLE public.products ADD CONSTRAINT products_org_id_barcode_key UNIQUE (org_id, barcode);
ALTER TABLE public.products ADD CONSTRAINT products_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD CONSTRAINT products_org_id_sku_key UNIQUE (org_id, sku);
ALTER TABLE public.products ADD CONSTRAINT products_pkey PRIMARY KEY (id);
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric)));
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_pkey PRIMARY KEY (id);
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE CASCADE;
ALTER TABLE public.quotation_items ADD CONSTRAINT quotation_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
ALTER TABLE public.quotations ADD CONSTRAINT quotations_adjustment_rates_check CHECK (((shipping_charge >= (0)::numeric) AND (abs(round_off_value) <= (1)::numeric) AND ((tds_rate >= (0)::numeric) AND (tds_rate <= (100)::numeric)) AND ((tcs_rate >= (0)::numeric) AND (tcs_rate <= (100)::numeric))));
ALTER TABLE public.quotations ADD CONSTRAINT quotations_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_discount_type_check CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text])));
ALTER TABLE public.quotations ADD CONSTRAINT quotations_discount_value_check CHECK (((discount_value >= (0)::numeric) AND ((discount_type <> 'percentage'::text) OR (discount_value <= (100)::numeric))));
ALTER TABLE public.quotations ADD CONSTRAINT quotations_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.quotations ADD CONSTRAINT quotations_org_id_quote_number_key UNIQUE (org_id, quote_number);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_pkey PRIMARY KEY (id);
ALTER TABLE public.quotations ADD CONSTRAINT quotations_round_off_mode_check CHECK ((round_off_mode = ANY (ARRAY['manual'::text, 'nearest_rupee'::text])));
ALTER TABLE public.sales_order_counters ADD CONSTRAINT sales_order_counters_last_number_check CHECK ((last_number >= 0));
ALTER TABLE public.sales_order_counters ADD CONSTRAINT sales_order_counters_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_order_counters ADD CONSTRAINT sales_order_counters_pkey PRIMARY KEY (org_id, year);
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_check CHECK (((reserved_qty >= (0)::numeric) AND (reserved_qty <= quantity)));
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_discount_pct_check CHECK (((discount_pct >= (0)::numeric) AND (discount_pct <= (100)::numeric)));
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_gst_rate_check CHECK (((gst_rate >= (0)::numeric) AND (gst_rate <= (100)::numeric)));
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_quantity_check CHECK ((quantity > (0)::numeric));
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_sales_order_id_fkey FOREIGN KEY (sales_order_id) REFERENCES sales_orders(id) ON DELETE CASCADE;
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_stock_status_check CHECK ((stock_status = ANY (ARRAY['reserved'::text, 'awaiting_stock'::text, 'backorder'::text, 'manual_check'::text, 'manual_confirmed'::text, 'deducted'::text])));
ALTER TABLE public.sales_order_items ADD CONSTRAINT sales_order_items_unit_price_check CHECK ((unit_price >= (0)::numeric));
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_org_id_fkey FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_org_id_order_number_key UNIQUE (org_id, order_number);
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_org_id_quotation_id_key UNIQUE (org_id, quotation_id);
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_payment_type_check CHECK ((payment_type = ANY (ARRAY['advance'::text, 'cod'::text, 'credit'::text])));
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_pkey PRIMARY KEY (id);
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_quotation_id_fkey FOREIGN KEY (quotation_id) REFERENCES quotations(id) ON DELETE RESTRICT;
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_status_check CHECK ((status = ANY (ARRAY['awaiting_stock'::text, 'reserved'::text, 'packing'::text, 'packed'::text, 'dispatched'::text, 'invoiced'::text, 'cancelled'::text])));
ALTER TABLE public.sales_orders ADD CONSTRAINT sales_orders_stock_status_check CHECK ((stock_status = ANY (ARRAY['reserved'::text, 'backorder'::text, 'manual_check'::text, 'deducted'::text, 'released'::text])));

-- Sequence ownership

-- Additional indexes
CREATE INDEX audit_org_idx ON public.audit_log USING btree (org_id, created_at DESC);
CREATE INDEX clients_name_idx ON public.clients USING gin (name gin_trgm_ops);
CREATE INDEX idx_clients_org_id_fk ON public.clients USING btree (org_id);
CREATE INDEX document_share_tokens_document_idx ON public.document_share_tokens USING btree (org_id, document_type, document_id, created_at DESC);
CREATE INDEX document_signatures_lookup_idx ON public.document_signatures USING btree (org_id, document_type, document_id);
CREATE INDEX idx_document_signatures_updated_by_fk ON public.document_signatures USING btree (updated_by);
CREATE INDEX idx_invitations_invited_by_fk ON public.invitations USING btree (invited_by);
CREATE INDEX idx_invitations_org_id_fk ON public.invitations USING btree (org_id);
CREATE INDEX idx_invoice_items_invoice_id_fk ON public.invoice_items USING btree (invoice_id);
CREATE INDEX idx_invoice_items_org_id_fk ON public.invoice_items USING btree (org_id);
CREATE INDEX idx_invoice_items_product_id_fk ON public.invoice_items USING btree (product_id);
CREATE INDEX idx_invoice_reminder_log_org_id_fk ON public.invoice_reminder_log USING btree (org_id);
CREATE INDEX invoice_reminder_log_invoice_type_sent_idx ON public.invoice_reminder_log USING btree (invoice_id, reminder_type, sent_at DESC);
CREATE INDEX idx_invoices_created_by_fk ON public.invoices USING btree (created_by);
CREATE INDEX idx_invoices_quotation_id_fk ON public.invoices USING btree (quotation_id);
CREATE INDEX idx_invoices_sales_order_id_fk ON public.invoices USING btree (sales_order_id);
CREATE INDEX invoices_client_idx ON public.invoices USING btree (client_id);
CREATE INDEX invoices_due_idx ON public.invoices USING btree (org_id, due_date);
CREATE UNIQUE INDEX invoices_one_per_quotation ON public.invoices USING btree (org_id, quotation_id) WHERE (quotation_id IS NOT NULL);
CREATE UNIQUE INDEX invoices_one_per_sales_order ON public.invoices USING btree (org_id, sales_order_id) WHERE (sales_order_id IS NOT NULL);
CREATE INDEX invoices_org_status_idx ON public.invoices USING btree (org_id, status);
CREATE INDEX invoices_reminder_candidates_idx ON public.invoices USING btree (due_date, status) WHERE (balance_due > (0)::numeric);
CREATE INDEX idx_org_members_user_id_fk ON public.org_members USING btree (user_id);
CREATE INDEX idx_organization_reminder_settings_enabled_by_fk ON public.organization_reminder_settings USING btree (enabled_by);
CREATE INDEX idx_organizations_created_by_fk ON public.organizations USING btree (created_by);
CREATE INDEX idx_payments_org_id_fk ON public.payments USING btree (org_id);
CREATE INDEX idx_payments_recorded_by_fk ON public.payments USING btree (recorded_by);
CREATE INDEX payments_invoice_idx ON public.payments USING btree (invoice_id);
CREATE INDEX products_barcode_idx ON public.products USING btree (org_id, barcode);
CREATE INDEX products_name_idx ON public.products USING gin (name gin_trgm_ops);
CREATE INDEX idx_quotation_items_org_id_fk ON public.quotation_items USING btree (org_id);
CREATE INDEX idx_quotation_items_product_id_fk ON public.quotation_items USING btree (product_id);
CREATE INDEX idx_quotation_items_quotation_id_fk ON public.quotation_items USING btree (quotation_id);
CREATE INDEX idx_quotations_client_id_fk ON public.quotations USING btree (client_id);
CREATE INDEX idx_quotations_created_by_fk ON public.quotations USING btree (created_by);
CREATE INDEX idx_quotations_invoice_id_fk ON public.quotations USING btree (invoice_id);
CREATE INDEX quotations_org_idx ON public.quotations USING btree (org_id, status);
CREATE INDEX idx_sales_order_items_product_id_fk ON public.sales_order_items USING btree (product_id);
CREATE INDEX idx_sales_order_items_sales_order_id_fk ON public.sales_order_items USING btree (sales_order_id);
CREATE INDEX sales_order_items_order_idx ON public.sales_order_items USING btree (org_id, sales_order_id, "position");
CREATE INDEX sales_order_items_reserved_product_idx ON public.sales_order_items USING btree (org_id, product_id) WHERE (reserved_qty > (0)::numeric);
CREATE INDEX idx_sales_orders_client_id_fk ON public.sales_orders USING btree (client_id);
CREATE INDEX idx_sales_orders_quotation_id_fk ON public.sales_orders USING btree (quotation_id);
CREATE INDEX sales_orders_org_created_idx ON public.sales_orders USING btree (org_id, created_at DESC);

-- Public-schema functions (security definitions and search_path retained)
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare inv invitations%rowtype; uemail text;
begin
  select email into uemail from auth.users where id = auth.uid();
  select * into inv from invitations
    where token = p_token and accepted_at is null and expires_at > now()
      and lower(email) = lower(uemail);
  if not found then raise exception 'Invalid or expired invitation'; end if;
  insert into org_members (org_id, user_id, role) values (inv.org_id, auth.uid(), inv.role)
    on conflict (org_id, user_id) do update set role = excluded.role;
  update invitations set accepted_at = now() where id = inv.id;
  return inv.org_id;
end $function$

CREATE OR REPLACE FUNCTION public.accept_quotation_create_sales_order(p_token_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token public.document_share_tokens%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_item record;
  v_order_id uuid;
  v_order_number text;
  v_counter integer;
  v_year integer := extract(year FROM timezone('Asia/Kolkata', now()))::integer;
  v_payment_type text := 'credit';
  v_has_untracked boolean := false;
  v_stock_available boolean := false;
  v_status text := 'awaiting_stock';
  v_stock_status text := 'manual_check';
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'This quotation action is restricted to the server workflow.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_token
    FROM public.document_share_tokens
   WHERE id = p_token_id
   FOR UPDATE;

  IF NOT FOUND OR v_token.document_type <> 'quotation' THEN
    RAISE EXCEPTION 'Quotation response link not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'This quotation link has expired. Ask the sender to resend it.'
      USING ERRCODE = '23514';
  END IF;
  IF v_token.responded_at IS NOT NULL OR v_token.response_status IS NOT NULL THEN
    RAISE EXCEPTION 'A response has already been recorded for this quotation.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_quote
    FROM public.quotations
   WHERE id = v_token.document_id
     AND org_id = v_token.org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_quote.status::text <> 'sent' THEN
    RAISE EXCEPTION 'This quotation is no longer awaiting a response.'
      USING ERRCODE = '23514';
  END IF;
  IF v_quote.valid_until IS NOT NULL AND v_quote.valid_until < timezone('Asia/Kolkata', now())::date THEN
    RAISE EXCEPTION 'This quotation has expired. Ask the sender for an updated quotation.'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.clients c
     WHERE c.id = v_quote.client_id AND c.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'The quotation client does not belong to this organization.'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.quotation_items qi
     WHERE qi.quotation_id = v_quote.id AND qi.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'A quotation without line items cannot become a sales order.'
      USING ERRCODE = '23514';
  END IF;

  IF lower(COALESCE(v_quote.terms, '')) ~ '(100%[[:space:]]*(advance|prepaid)|advance[[:space:]]*payment|prepaid|payment[[:space:]]*in[[:space:]]*advance)' THEN
    v_payment_type := 'advance';
  ELSIF lower(COALESCE(v_quote.terms, '')) ~ '(^|[^a-z])cod([^a-z]|$)|cash[[:space:]]*on[[:space:]]*delivery' THEN
    v_payment_type := 'cod';
  ELSE
    v_payment_type := 'credit';
  END IF;

  INSERT INTO public.sales_order_counters (org_id, year, last_number)
  VALUES (v_quote.org_id, v_year, 1)
  ON CONFLICT (org_id, year)
  DO UPDATE SET last_number = public.sales_order_counters.last_number + 1
  RETURNING last_number INTO v_counter;
  v_order_number := 'SO-' || v_year::text || '-' || lpad(v_counter::text, 4, '0');

  INSERT INTO public.sales_orders (
    org_id, quotation_id, client_id, order_number, status, stock_status, payment_type, payment_terms
  ) VALUES (
    v_quote.org_id, v_quote.id, v_quote.client_id, v_order_number,
    'awaiting_stock', 'manual_check', v_payment_type, v_quote.terms
  )
  RETURNING id INTO v_order_id;

  -- Serialize reservations against concurrent acceptances of the same products.
  PERFORM p.id
    FROM public.products p
   WHERE p.org_id = v_quote.org_id
     AND p.id IN (
       SELECT DISTINCT qi.product_id
         FROM public.quotation_items qi
        WHERE qi.quotation_id = v_quote.id
          AND qi.org_id = v_quote.org_id
          AND qi.product_id IS NOT NULL
     )
   ORDER BY p.id
   FOR UPDATE;

  FOR v_item IN
    SELECT qi.*, p.sku AS product_sku
      FROM public.quotation_items qi
      LEFT JOIN public.products p
        ON p.id = qi.product_id AND p.org_id = qi.org_id
     WHERE qi.quotation_id = v_quote.id
       AND qi.org_id = v_quote.org_id
     ORDER BY qi.position, qi.id
  LOOP
    IF v_item.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products p
       WHERE p.id = v_item.product_id AND p.org_id = v_quote.org_id
    ) THEN
      RAISE EXCEPTION 'A quotation product no longer belongs to this organization.'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.sales_order_items (
      org_id, sales_order_id, product_id, sku, description, hsn_sac, unit,
      quantity, unit_price, discount_pct, gst_rate, position, reserved_qty, stock_status
    ) VALUES (
      v_quote.org_id, v_order_id, v_item.product_id, v_item.product_sku,
      v_item.description, v_item.hsn_sac, COALESCE(NULLIF(v_item.unit, ''), 'pcs'),
      v_item.quantity, v_item.unit_price, COALESCE(v_item.discount_pct, 0),
      COALESCE(v_item.gst_rate, 0), v_item.position, 0,
      CASE WHEN v_item.product_id IS NULL THEN 'manual_check' ELSE 'awaiting_stock' END
    );
  END LOOP;

  v_has_untracked := EXISTS (
    SELECT 1 FROM public.sales_order_items soi
     WHERE soi.sales_order_id = v_order_id AND soi.product_id IS NULL
  );

  SELECT NOT EXISTS (
    SELECT 1
      FROM (
        SELECT soi.product_id, sum(soi.quantity) AS required_qty
          FROM public.sales_order_items soi
         WHERE soi.sales_order_id = v_order_id
           AND soi.product_id IS NOT NULL
         GROUP BY soi.product_id
      ) required
      JOIN public.products p
        ON p.id = required.product_id AND p.org_id = v_quote.org_id
     WHERE COALESCE(p.stock_qty, 0) - COALESCE((
       SELECT sum(reserved.reserved_qty)
         FROM public.sales_order_items reserved
         JOIN public.sales_orders reserved_order
           ON reserved_order.id = reserved.sales_order_id AND reserved_order.org_id = reserved.org_id
        WHERE reserved.org_id = v_quote.org_id
          AND reserved.product_id = required.product_id
          AND reserved.sales_order_id <> v_order_id
          AND reserved.reserved_qty > 0
          AND reserved_order.status IN ('reserved','packing','packed','dispatched')
          AND reserved_order.stock_deducted_at IS NULL
     ), 0) < required.required_qty
  ) INTO v_stock_available;

  IF NOT v_has_untracked AND v_stock_available THEN
    UPDATE public.sales_order_items
       SET reserved_qty = quantity, stock_status = 'reserved', updated_at = now()
     WHERE sales_order_id = v_order_id AND org_id = v_quote.org_id AND product_id IS NOT NULL;
    v_status := 'reserved';
    v_stock_status := 'reserved';
  ELSIF v_has_untracked THEN
    v_status := 'awaiting_stock';
    v_stock_status := 'manual_check';
    UPDATE public.sales_order_items
       SET stock_status = CASE WHEN product_id IS NULL THEN 'manual_check' ELSE 'awaiting_stock' END,
           updated_at = now()
     WHERE sales_order_id = v_order_id AND org_id = v_quote.org_id;
  ELSE
    v_status := 'awaiting_stock';
    v_stock_status := 'backorder';
    UPDATE public.sales_order_items
       SET stock_status = 'backorder', updated_at = now()
     WHERE sales_order_id = v_order_id AND org_id = v_quote.org_id AND product_id IS NOT NULL;
  END IF;

  UPDATE public.sales_orders
     SET status = v_status,
         stock_status = v_stock_status,
         stock_reserved_at = CASE WHEN v_status = 'reserved' THEN now() ELSE NULL END,
         updated_at = now()
   WHERE id = v_order_id AND org_id = v_quote.org_id;

  UPDATE public.quotations
     SET status = 'accepted'
   WHERE id = v_quote.id AND org_id = v_quote.org_id AND status::text = 'sent';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while acceptance was being recorded.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.document_share_tokens
     SET response_status = 'accepted', responded_at = now()
   WHERE id = v_token.id AND responded_at IS NULL AND response_status IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A response was recorded for this quotation by another request.'
      USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'created', true,
    'salesOrderId', v_order_id, 'salesOrderNumber', v_order_number,
    'orderStatus', v_status, 'stockStatus', v_stock_status,
    'paymentType', v_payment_type
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.add_owner_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into org_members (org_id, user_id, role) values (new.id, auth.uid(), 'owner');
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.audit_trigger()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r jsonb;
begin
  if tg_op = 'DELETE' then
    r := to_jsonb(old);
  else
    r := to_jsonb(new);
  end if;

  insert into public.audit_log (
    org_id, user_id, table_name, record_id,
    action, old_data, new_data
  )
  values (
    coalesce((r->>'org_id')::uuid, (r->>'id')::uuid),
    auth.uid(),
    tg_table_name,
    coalesce(r->>'id', r->>'user_id'),
    tg_op,
    case when tg_op in ('UPDATE','DELETE')
      then to_jsonb(old) end,
    case when tg_op in ('INSERT','UPDATE')
      then to_jsonb(new) end
  );

  return null;
end;
$function$

CREATE OR REPLACE FUNCTION public.cancel_invoice_if_unpaid(p_org_id uuid, p_invoice_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_invoice public.invoices%ROWTYPE;
    v_total_paid numeric(14,2);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in before cancelling an invoice.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_invoice
      FROM public.invoices
     WHERE id = p_invoice_id AND org_id = p_org_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice not found in this organization.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.org_members AS member
        WHERE member.org_id = p_org_id AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You do not belong to this organization.' USING ERRCODE = '42501';
    END IF;

    IF lower(COALESCE(v_invoice.status::text, '')) = 'cancelled' THEN
        RAISE EXCEPTION 'Invoice is already cancelled.' USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(SUM(payment.amount), 0)
      INTO v_total_paid
      FROM public.payments AS payment
     WHERE payment.invoice_id = v_invoice.id
       AND payment.org_id = p_org_id;

    IF COALESCE(v_total_paid, 0) > 0
       OR COALESCE(v_invoice.amount_paid, 0) > 0
       OR lower(COALESCE(v_invoice.status::text, '')) IN ('paid', 'partially_paid') THEN
        RAISE EXCEPTION 'Invoices with recorded payments cannot be cancelled. Resolve the payment/refund through the appropriate accounting workflow.'
            USING ERRCODE = '23514';
    END IF;

    UPDATE public.invoices
       SET status = 'cancelled'
     WHERE id = v_invoice.id
       AND org_id = p_org_id
       AND lower(status::text) <> 'cancelled';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice could not be cancelled because its status changed.' USING ERRCODE = '40001';
    END IF;

    RETURN v_invoice.id;
END;
$function$

CREATE OR REPLACE FUNCTION public.convert_quotation_to_invoice(p_quote_id uuid, p_due_date date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_item record;
  v_invoice_id uuid;
  v_issue_date date;
  v_payment_terms_days integer := 15;
  v_position integer := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in before converting a quotation.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_quote
  FROM public.quotations
  WHERE id = p_quote_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found or you do not have access to it.' USING ERRCODE = 'P0002';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.org_members AS member
    WHERE member.org_id = v_quote.org_id
      AND member.user_id = auth.uid()
      AND lower(COALESCE(member.role::text, '')) IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'Only business owners or admins can convert quotations.' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients AS client
    WHERE client.id = v_quote.client_id AND client.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'The quotation client does not belong to the same organization.' USING ERRCODE = '23514';
  END IF;

  -- Return the existing invoice for repeated clicks/retries rather than creating a duplicate.
  SELECT id INTO v_invoice_id
  FROM public.invoices
  WHERE org_id = v_quote.org_id AND quotation_id = v_quote.id
  LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    IF lower(COALESCE(v_quote.status::text, '')) NOT IN ('accepted', 'converted') THEN
      RAISE EXCEPTION 'Only an accepted quotation can be converted to an invoice.' USING ERRCODE = '23514';
    END IF;

    UPDATE public.quotations
    SET status = 'converted', invoice_id = v_invoice_id
    WHERE id = v_quote.id AND org_id = v_quote.org_id
      AND lower(status::text) IN ('accepted', 'converted');

    RETURN v_invoice_id;
  END IF;

  -- Cast enum status to text before COALESCE; '' is not a quotation_status enum value.
  IF lower(COALESCE(v_quote.status::text, '')) <> 'accepted' THEN
    RAISE EXCEPTION 'Only an accepted quotation can be converted to an invoice.' USING ERRCODE = '23514';
  END IF;

  v_issue_date := timezone('Asia/Kolkata', now())::date;

  SELECT COALESCE(default_payment_terms_days, 15)
  INTO v_payment_terms_days
  FROM public.organizations
  WHERE id = v_quote.org_id;

  v_payment_terms_days := GREATEST(0, LEAST(COALESCE(v_payment_terms_days, 15), 3650));

  INSERT INTO public.invoices (org_id, client_id, quotation_id, issue_date, due_date, status, notes, terms)
  VALUES (
    v_quote.org_id,
    v_quote.client_id,
    v_quote.id,
    v_issue_date,
    COALESCE(p_due_date, v_issue_date + v_payment_terms_days),
    'pending',
    v_quote.notes,
    v_quote.terms
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT * FROM public.quotation_items
    WHERE quotation_id = v_quote.id AND org_id = v_quote.org_id
    ORDER BY position, id
  LOOP
    IF v_item.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products AS product
      WHERE product.id = v_item.product_id AND product.org_id = v_quote.org_id
    ) THEN
      RAISE EXCEPTION 'Every converted quotation product must belong to the same organization.' USING ERRCODE = '23514';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.unit_price IS NULL OR v_item.unit_price < 0
       OR COALESCE(v_item.discount_pct, 0) < 0 OR COALESCE(v_item.discount_pct, 0) > 100
       OR COALESCE(v_item.gst_rate, 0) < 0 OR COALESCE(v_item.gst_rate, 0) > 100 THEN
      RAISE EXCEPTION 'Quotation contains an invalid quantity, price, discount, or GST value.' USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.invoice_items (
      org_id, invoice_id, position, product_id, description,
      hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
    )
    VALUES (
      v_quote.org_id, v_invoice_id, v_position, v_item.product_id, v_item.description,
      v_item.hsn_sac, COALESCE(NULLIF(v_item.unit, ''), 'unit'),
      v_item.quantity, v_item.unit_price, COALESCE(v_item.discount_pct, 0),
      COALESCE(v_item.gst_rate, 0)
    );
    v_position := v_position + 1;
  END LOOP;

  IF v_position = 0 THEN
    RAISE EXCEPTION 'Cannot convert a quotation with no line items.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.quotations
  SET status = 'converted', invoice_id = v_invoice_id
  WHERE id = v_quote.id AND org_id = v_quote.org_id AND lower(status::text) = 'accepted';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while it was being converted.' USING ERRCODE = '40001';
  END IF;

  RETURN v_invoice_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
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
$function$

CREATE OR REPLACE FUNCTION public.enforce_invoice_payment_update_integrity()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.has_role(o uuid, roles member_role[])
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from org_members where org_id = o and user_id = auth.uid() and role = any(roles));
$function$

CREATE OR REPLACE FUNCTION public.iitem_calc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare p invoices%rowtype; base numeric(14,2); tax numeric(14,2);
begin
  select * into p from invoices where id = new.invoice_id;
  if not found then raise exception 'Invoice not found'; end if;
  new.org_id := p.org_id;
  base := round(new.quantity * new.unit_price * (1 - new.discount_pct / 100), 2);
  tax := round(base * new.gst_rate / 100, 2);
  new.taxable_amount := base;
  if p.is_interstate then
    new.igst_amount := tax; new.cgst_amount := 0; new.sgst_amount := 0;
  else
    new.cgst_amount := round(tax / 2, 2); new.sgst_amount := tax - round(tax / 2, 2); new.igst_amount := 0;
  end if;
  new.line_total := base + tax;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.iitem_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  iid uuid;
  v_shipping numeric(14,2);
  v_round_mode text;
  v_round_value numeric(14,2);
  v_tds_rate numeric(5,2);
  v_tcs_rate numeric(5,2);
  v_sub numeric(14,2);
  v_c numeric(14,2);
  v_sg numeric(14,2);
  v_i numeric(14,2);
  v_line_total numeric(14,2);
  v_tds numeric(14,2);
  v_tcs numeric(14,2);
  v_before_round numeric(14,2);
  v_round numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN iid := OLD.invoice_id; ELSE iid := NEW.invoice_id; END IF;
  SELECT shipping_charge, round_off_mode, round_off_value, tds_rate, tcs_rate
    INTO v_shipping, v_round_mode, v_round_value, v_tds_rate, v_tcs_rate
    FROM public.invoices WHERE id = iid;
  SELECT COALESCE(SUM(taxable_amount),0), COALESCE(SUM(cgst_amount),0),
         COALESCE(SUM(sgst_amount),0), COALESCE(SUM(igst_amount),0), COALESCE(SUM(line_total),0)
    INTO v_sub, v_c, v_sg, v_i, v_line_total
    FROM public.invoice_items WHERE invoice_id = iid;
  v_tds := ROUND(v_sub * COALESCE(v_tds_rate,0) / 100, 2);
  v_tcs := ROUND(v_sub * COALESCE(v_tcs_rate,0) / 100, 2);
  v_before_round := v_line_total + COALESCE(v_shipping,0) + v_tcs - v_tds;
  v_round := CASE WHEN COALESCE(v_round_mode,'manual') = 'nearest_rupee'
                  THEN ROUND(v_before_round) - v_before_round
                  ELSE COALESCE(v_round_value,0) END;
  UPDATE public.invoices SET
    subtotal = v_sub, cgst_total = v_c, sgst_total = v_sg, igst_total = v_i,
    tax_total = v_c + v_sg + v_i, tds_amount = v_tds, tcs_amount = v_tcs,
    round_off_amount = v_round, grand_total = ROUND(v_before_round + v_round, 2)
  WHERE id = iid;
  PERFORM public.invoice_refresh(iid);
  RETURN NULL;
END;
$function$

CREATE OR REPLACE FUNCTION public.initialize_org_reminder_settings()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
    INSERT INTO public.organization_reminder_settings (org_id)
    VALUES (NEW.id)
    ON CONFLICT (org_id) DO NOTHING;

    RETURN NEW;
END;
$function$

CREATE OR REPLACE FUNCTION public.invoice_before_save()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare org_state text; cl_state text; cl_org uuid;
begin
  select state_code, org_id into cl_state, cl_org from clients where id = new.client_id;
  if cl_org is null or cl_org <> new.org_id then
    raise exception 'Client does not belong to this organization';
  end if;
  select state_code into org_state from organizations where id = new.org_id;
  new.is_interstate := (org_state is not null and cl_state is not null and org_state <> cl_state);
  if tg_op = 'INSERT' and new.invoice_number is null then
    new.invoice_number := next_doc_number(new.org_id, 'invoice');
  end if;
  if tg_op = 'UPDATE' then new.invoice_number := old.invoice_number; end if;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.invoice_refresh(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.is_member(o uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (select 1 from org_members where org_id = o and user_id = auth.uid());
$function$

CREATE OR REPLACE FUNCTION public.manage_sales_order_action(p_org_id uuid, p_order_id uuid, p_action text, p_carrier text DEFAULT NULL::text, p_tracking_number text DEFAULT NULL::text, p_tracking_url text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_order public.sales_orders%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_counter integer;
  v_year integer := extract(year FROM timezone('Asia/Kolkata', now()))::integer;
  v_issue_date date := timezone('Asia/Kolkata', now())::date;
  v_terms_days integer := 15;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'This sales-order action is restricted to the server workflow.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_order
    FROM public.sales_orders
   WHERE id = p_order_id AND org_id = p_org_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sales order not found.' USING ERRCODE = 'P0002';
  END IF;

  IF p_action = 'confirm_stock' THEN
    IF v_order.status <> 'awaiting_stock' THEN
      RAISE EXCEPTION 'Only orders awaiting a stock check can reserve stock.'
        USING ERRCODE = '23514';
    END IF;

    PERFORM p.id
      FROM public.products p
     WHERE p.org_id = p_org_id
       AND p.id IN (
         SELECT DISTINCT soi.product_id FROM public.sales_order_items soi
          WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id AND soi.product_id IS NOT NULL
       )
     ORDER BY p.id FOR UPDATE;

    IF EXISTS (
      SELECT 1
        FROM (
          SELECT soi.product_id, sum(soi.quantity) AS required_qty
            FROM public.sales_order_items soi
           WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id AND soi.product_id IS NOT NULL
           GROUP BY soi.product_id
        ) required
        JOIN public.products p ON p.id = required.product_id AND p.org_id = p_org_id
       WHERE COALESCE(p.stock_qty, 0) - COALESCE((
         SELECT sum(reserved.reserved_qty)
           FROM public.sales_order_items reserved
           JOIN public.sales_orders other_order
             ON other_order.id = reserved.sales_order_id AND other_order.org_id = reserved.org_id
          WHERE reserved.org_id = p_org_id
            AND reserved.product_id = required.product_id
            AND reserved.sales_order_id <> v_order.id
            AND reserved.reserved_qty > 0
            AND other_order.status IN ('reserved','packing','packed','dispatched')
            AND other_order.stock_deducted_at IS NULL
       ), 0) < required.required_qty
    ) THEN
      RAISE EXCEPTION 'Not enough available stock for every tracked product. Restock or resolve the backorder first.'
        USING ERRCODE = '23514';
    END IF;

    UPDATE public.sales_order_items
       SET reserved_qty = quantity,
           stock_status = 'reserved',
           updated_at = now()
     WHERE sales_order_id = v_order.id AND org_id = p_org_id AND product_id IS NOT NULL;
    UPDATE public.sales_order_items
       SET reserved_qty = 0,
           stock_status = 'manual_confirmed',
           updated_at = now()
     WHERE sales_order_id = v_order.id AND org_id = p_org_id AND product_id IS NULL;

    UPDATE public.sales_orders
       SET status = 'reserved',
           stock_status = 'reserved',
           stock_reserved_at = now(),
           updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

  ELSIF p_action = 'mark_advance_paid' THEN
    IF v_order.payment_type <> 'advance' OR v_order.status <> 'reserved' THEN
      RAISE EXCEPTION 'Advance payment can only be confirmed for a stock-reserved advance order.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sales_orders
       SET advance_paid = true, updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

  ELSIF p_action = 'start_packing' THEN
    IF v_order.status <> 'reserved' THEN
      RAISE EXCEPTION 'Reserve the stock before starting packing.'
        USING ERRCODE = '23514';
    END IF;
    IF v_order.payment_type = 'advance' AND NOT v_order.advance_paid THEN
      RAISE EXCEPTION 'This order requires advance payment. Send payment instructions and confirm the advance before packing.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sales_orders
       SET status = 'packing', updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

  ELSIF p_action = 'mark_packed' THEN
    IF v_order.status <> 'packing' THEN
      RAISE EXCEPTION 'Start packing before marking an order packed.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sales_orders
       SET status = 'packed', packed_at = now(), updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

  ELSIF p_action = 'dispatch' THEN
    IF v_order.status <> 'packed' THEN
      RAISE EXCEPTION 'Only packed orders can be dispatched.'
        USING ERRCODE = '23514';
    END IF;
    IF length(btrim(COALESCE(p_carrier, ''))) = 0 OR length(btrim(COALESCE(p_tracking_number, ''))) = 0 THEN
      RAISE EXCEPTION 'Enter the courier/carrier and tracking number before dispatch.'
        USING ERRCODE = '23514';
    END IF;
    IF p_tracking_url IS NOT NULL AND btrim(p_tracking_url) <> ''
       AND btrim(p_tracking_url) !~* '^https://[^[:space:]]+$' THEN
      RAISE EXCEPTION 'Tracking URL must be a valid HTTPS URL.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sales_orders
       SET status = 'dispatched',
           carrier = left(btrim(p_carrier), 120),
           tracking_number = left(btrim(p_tracking_number), 180),
           tracking_url = NULLIF(left(btrim(COALESCE(p_tracking_url, '')), 2000), ''),
           dispatched_at = now(),
           updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

  ELSIF p_action = 'cancel_order' THEN
    IF v_order.status NOT IN ('awaiting_stock','reserved') THEN
      RAISE EXCEPTION 'Only orders awaiting stock or reserved but not yet packed can be cancelled.'
        USING ERRCODE = '23514';
    END IF;
    UPDATE public.sales_order_items
       SET reserved_qty = 0, stock_status = 'awaiting_stock', updated_at = now()
     WHERE sales_order_id = v_order.id AND org_id = p_org_id;
    UPDATE public.sales_orders
       SET status = 'cancelled', stock_status = 'released', updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

  ELSIF p_action = 'generate_invoice' THEN
    SELECT id, invoice_number INTO v_invoice_id, v_invoice_number
      FROM public.invoices
     WHERE org_id = p_org_id AND sales_order_id = v_order.id
     LIMIT 1;
    IF v_invoice_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true, 'invoiceCreated', false,
        'invoiceId', v_invoice_id, 'invoiceNumber', v_invoice_number,
        'orderStatus', v_order.status
      );
    END IF;

    IF v_order.status <> 'dispatched' THEN
      RAISE EXCEPTION 'Mark the packed order as dispatched and add its tracking number before generating the final tax invoice.'
        USING ERRCODE = '23514';
    END IF;
    IF v_order.payment_type = 'advance' AND NOT v_order.advance_paid THEN
      RAISE EXCEPTION 'Confirm the required advance payment before generating the tax invoice.'
        USING ERRCODE = '23514';
    END IF;

    -- Lock all tracked products and refuse to deduct if stock changed after reservation.
    PERFORM p.id
      FROM public.products p
     WHERE p.org_id = p_org_id
       AND p.id IN (
         SELECT DISTINCT soi.product_id FROM public.sales_order_items soi
          WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id
            AND soi.product_id IS NOT NULL AND soi.reserved_qty > 0
       )
     ORDER BY p.id FOR UPDATE;

    IF EXISTS (
      SELECT 1
        FROM (
          SELECT soi.product_id, sum(soi.reserved_qty) AS required_qty
            FROM public.sales_order_items soi
           WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id
             AND soi.product_id IS NOT NULL AND soi.reserved_qty > 0
           GROUP BY soi.product_id
        ) required
        JOIN public.products p ON p.id = required.product_id AND p.org_id = p_org_id
       WHERE COALESCE(p.stock_qty, 0) < required.required_qty
    ) THEN
      RAISE EXCEPTION 'Stock changed after reservation. Reconcile inventory before invoicing.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.sales_order_items soi
       WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id
         AND soi.product_id IS NOT NULL AND soi.reserved_qty < soi.quantity
    ) THEN
      RAISE EXCEPTION 'Some tracked products are not reserved. Confirm stock before invoicing.'
        USING ERRCODE = '23514';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.invoices i
       WHERE i.org_id = p_org_id AND i.quotation_id = v_order.quotation_id
    ) THEN
      RAISE EXCEPTION 'An invoice already exists for this quotation. Review it before creating another tax invoice.'
        USING ERRCODE = '23514';
    END IF;

    SELECT COALESCE(default_payment_terms_days, 15)
      INTO v_terms_days
      FROM public.organizations
     WHERE id = p_org_id;
    v_terms_days := GREATEST(0, LEAST(COALESCE(v_terms_days, 15), 3650));

    INSERT INTO public.invoices (
      org_id, client_id, quotation_id, sales_order_id, issue_date, due_date, status, notes, terms
    ) VALUES (
      p_org_id, v_order.client_id, v_order.quotation_id, v_order.id,
      v_issue_date, v_issue_date + v_terms_days, 'draft',
      (SELECT q.notes FROM public.quotations q WHERE q.id = v_order.quotation_id AND q.org_id = p_org_id),
      COALESCE(v_order.payment_terms, 'Net ' || v_terms_days::text)
    )
    RETURNING id, invoice_number INTO v_invoice_id, v_invoice_number;

    INSERT INTO public.invoice_items (
      org_id, invoice_id, position, product_id, description, hsn_sac,
      unit, quantity, unit_price, discount_pct, gst_rate
    )
    SELECT p_org_id, v_invoice_id, soi.position, soi.product_id, soi.description,
           soi.hsn_sac, COALESCE(NULLIF(soi.unit, ''), 'pcs'),
           soi.quantity, soi.unit_price, soi.discount_pct, soi.gst_rate
      FROM public.sales_order_items soi
     WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id
     ORDER BY soi.position;

    UPDATE public.products p
       SET stock_qty = p.stock_qty - reserved.required_qty,
           updated_at = now()
      FROM (
        SELECT soi.product_id, sum(soi.reserved_qty) AS required_qty
          FROM public.sales_order_items soi
         WHERE soi.sales_order_id = v_order.id AND soi.org_id = p_org_id
           AND soi.product_id IS NOT NULL AND soi.reserved_qty > 0
         GROUP BY soi.product_id
      ) reserved
     WHERE p.id = reserved.product_id AND p.org_id = p_org_id;

    UPDATE public.sales_order_items
       SET reserved_qty = 0,
           stock_status = CASE WHEN product_id IS NULL THEN 'manual_confirmed' ELSE 'deducted' END,
           updated_at = now()
     WHERE sales_order_id = v_order.id AND org_id = p_org_id;

    UPDATE public.sales_orders
       SET status = 'invoiced',
           stock_status = 'deducted',
           stock_deducted_at = now(),
           invoice_generated_at = now(),
           updated_at = now()
     WHERE id = v_order.id AND org_id = p_org_id;

    UPDATE public.quotations
       SET status = 'converted'
     WHERE id = v_order.quotation_id AND org_id = p_org_id AND status::text = 'accepted';

    RETURN jsonb_build_object(
      'success', true, 'invoiceCreated', true,
      'invoiceId', v_invoice_id, 'invoiceNumber', v_invoice_number,
      'orderStatus', 'invoiced'
    );

  ELSE
    RAISE EXCEPTION 'Unsupported sales-order action.'
      USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'success', true, 'action', p_action,
    'orderId', v_order.id
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.next_doc_number(p_org uuid, p_type text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  yr integer := extract(year from current_date)::integer;
  n integer;
  pref text;
BEGIN
  IF p_type NOT IN ('invoice', 'quotation') THEN
    RAISE EXCEPTION 'Unsupported document type.' USING ERRCODE = '22023';
  END IF;

  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role'
     AND NOT public.is_member(p_org) THEN
    RAISE EXCEPTION 'Not a member of this organization.' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.document_counters (org_id, doc_type, year, last_number)
  VALUES (p_org, p_type, yr, 1)
  ON CONFLICT (org_id, doc_type, year)
  DO UPDATE SET last_number = public.document_counters.last_number + 1
  RETURNING last_number INTO n;

  SELECT CASE WHEN p_type = 'invoice' THEN invoice_prefix ELSE quote_prefix END
    INTO pref
    FROM public.organizations
   WHERE id = p_org;

  IF pref IS NULL THEN
    RAISE EXCEPTION 'Organization not found for document numbering.' USING ERRCODE = 'P0002';
  END IF;

  RETURN pref || '-' || yr || '-' || lpad(n::text, 4, '0');
END;
$function$

CREATE OR REPLACE FUNCTION public.payment_after()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
$function$

CREATE OR REPLACE FUNCTION public.payment_before()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare inv invoices%rowtype;
begin
  select * into inv from invoices where id = new.invoice_id;
  if not found then raise exception 'Invoice not found'; end if;
  new.org_id := inv.org_id;
  if inv.status in ('draft','cancelled') then
    raise exception 'Cannot record a payment on a % invoice', inv.status;
  end if;
  if new.amount > inv.balance_due then
    raise exception 'Payment exceeds balance due (%)', inv.balance_due;
  end if;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.qitem_calc()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare p quotations%rowtype; base numeric(14,2); tax numeric(14,2);
begin
  select * into p from quotations where id = new.quotation_id;
  if not found then raise exception 'Quotation not found'; end if;
  new.org_id := p.org_id;
  base := round(new.quantity * new.unit_price * (1 - new.discount_pct / 100), 2);
  tax := round(base * new.gst_rate / 100, 2);
  new.taxable_amount := base;
  if p.is_interstate then
    new.igst_amount := tax; new.cgst_amount := 0; new.sgst_amount := 0;
  else
    new.cgst_amount := round(tax / 2, 2); new.sgst_amount := tax - round(tax / 2, 2); new.igst_amount := 0;
  end if;
  new.line_total := base + tax;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.qitem_totals()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  qid uuid;
  v_shipping numeric(14,2);
  v_round_mode text;
  v_round_value numeric(14,2);
  v_tds_rate numeric(5,2);
  v_tcs_rate numeric(5,2);
  v_sub numeric(14,2);
  v_c numeric(14,2);
  v_sg numeric(14,2);
  v_i numeric(14,2);
  v_line_total numeric(14,2);
  v_tds numeric(14,2);
  v_tcs numeric(14,2);
  v_before_round numeric(14,2);
  v_round numeric(14,2);
BEGIN
  IF TG_OP = 'DELETE' THEN qid := OLD.quotation_id; ELSE qid := NEW.quotation_id; END IF;
  SELECT shipping_charge, round_off_mode, round_off_value, tds_rate, tcs_rate
    INTO v_shipping, v_round_mode, v_round_value, v_tds_rate, v_tcs_rate
    FROM public.quotations WHERE id = qid;
  SELECT COALESCE(SUM(taxable_amount),0), COALESCE(SUM(cgst_amount),0),
         COALESCE(SUM(sgst_amount),0), COALESCE(SUM(igst_amount),0), COALESCE(SUM(line_total),0)
    INTO v_sub, v_c, v_sg, v_i, v_line_total
    FROM public.quotation_items WHERE quotation_id = qid;
  v_tds := ROUND(v_sub * COALESCE(v_tds_rate,0) / 100, 2);
  v_tcs := ROUND(v_sub * COALESCE(v_tcs_rate,0) / 100, 2);
  v_before_round := v_line_total + COALESCE(v_shipping,0) + v_tcs - v_tds;
  v_round := CASE WHEN COALESCE(v_round_mode,'manual') = 'nearest_rupee'
                  THEN ROUND(v_before_round) - v_before_round
                  ELSE COALESCE(v_round_value,0) END;
  UPDATE public.quotations SET
    subtotal = v_sub, cgst_total = v_c, sgst_total = v_sg, igst_total = v_i,
    tax_total = v_c + v_sg + v_i, tds_amount = v_tds, tcs_amount = v_tcs,
    round_off_amount = v_round, grand_total = ROUND(v_before_round + v_round, 2)
  WHERE id = qid;
  RETURN NULL;
END;
$function$

CREATE OR REPLACE FUNCTION public.quotation_before_save()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare org_state text; cl_state text; cl_org uuid;
begin
  select state_code, org_id into cl_state, cl_org from clients where id = new.client_id;
  if cl_org is null or cl_org <> new.org_id then
    raise exception 'Client does not belong to this organization';
  end if;
  select state_code into org_state from organizations where id = new.org_id;
  new.is_interstate := (org_state is not null and cl_state is not null and org_state <> cl_state);
  if tg_op = 'INSERT' and new.quote_number is null then
    new.quote_number := next_doc_number(new.org_id, 'quotation');
  end if;
  if tg_op = 'UPDATE' then new.quote_number := old.quote_number; end if;
  return new;
end $function$

CREATE OR REPLACE FUNCTION public.respond_to_quotation_and_convert_to_invoice(p_token_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_token public.document_share_tokens%ROWTYPE;
  v_quote public.quotations%ROWTYPE;
  v_item record;
  v_invoice_id uuid;
  v_issue_date date;
  v_payment_terms_days integer := 15;
  v_position integer := 0;
  v_responded_at timestamptz := now();
  v_today date := timezone('Asia/Kolkata', now())::date;
  v_already_accepted boolean := false;
BEGIN
  -- This RPC is only for the trusted Edge Function using the service-role JWT.
  -- The function is SECURITY DEFINER, so its callable roles must remain restricted.
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'This quotation-response action is restricted to the server workflow.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_token
    FROM public.document_share_tokens
   WHERE id = p_token_id
   FOR UPDATE;

  IF NOT FOUND OR v_token.document_type <> 'quotation' THEN
    RAISE EXCEPTION 'Quotation response link not found.' USING ERRCODE = 'P0002';
  END IF;

  -- Allow an already-accepted response to safely finish conversion if a previous
  -- request recorded the response but stopped before creating the invoice.
  IF v_token.response_status = 'accepted' AND v_token.responded_at IS NOT NULL THEN
    v_already_accepted := true;
  ELSIF v_token.response_status IS NOT NULL OR v_token.responded_at IS NOT NULL THEN
    RAISE EXCEPTION 'A response has already been recorded for this quotation.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_already_accepted AND v_token.expires_at <= now() THEN
    RAISE EXCEPTION 'This quotation link has expired. Ask the sender to resend it.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_quote
    FROM public.quotations
   WHERE id = v_token.document_id
     AND org_id = v_token.org_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_quote.status::text = 'converted' THEN
    SELECT id INTO v_invoice_id
      FROM public.invoices
     WHERE org_id = v_quote.org_id AND quotation_id = v_quote.id
     LIMIT 1;
    IF v_invoice_id IS NULL THEN
      RAISE EXCEPTION 'This quotation is marked converted but no linked invoice was found. Contact the business owner.'
        USING ERRCODE = '23514';
    END IF;

    IF NOT v_already_accepted THEN
      UPDATE public.document_share_tokens
         SET response_status = 'accepted', responded_at = v_responded_at
       WHERE id = v_token.id AND responded_at IS NULL;
    END IF;

    RETURN jsonb_build_object(
      'success', true,
      'responseStatus', 'accepted',
      'respondedAt', COALESCE(v_token.responded_at, v_responded_at),
      'invoiceCreated', false,
      'invoiceId', v_invoice_id
    );
  END IF;

  IF v_quote.status::text NOT IN ('sent', 'accepted') THEN
    RAISE EXCEPTION 'This quotation is no longer awaiting acceptance.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT v_already_accepted AND v_quote.valid_until IS NOT NULL AND v_quote.valid_until < v_today THEN
    RAISE EXCEPTION 'This quotation has expired. Ask the sender for an updated quotation.'
      USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clients AS client
    WHERE client.id = v_quote.client_id AND client.org_id = v_quote.org_id
  ) THEN
    RAISE EXCEPTION 'The quotation client does not belong to this organization.'
      USING ERRCODE = '23514';
  END IF;

  -- Return an existing linked invoice instead of ever creating a duplicate.
  SELECT id INTO v_invoice_id
    FROM public.invoices
   WHERE org_id = v_quote.org_id AND quotation_id = v_quote.id
   LIMIT 1;

  IF v_invoice_id IS NOT NULL THEN
    UPDATE public.quotations
       SET status = 'converted'
     WHERE id = v_quote.id AND org_id = v_quote.org_id;
    UPDATE public.document_share_tokens
       SET response_status = 'accepted',
           responded_at = COALESCE(responded_at, v_responded_at)
     WHERE id = v_token.id;
    RETURN jsonb_build_object(
      'success', true,
      'responseStatus', 'accepted',
      'respondedAt', COALESCE(v_token.responded_at, v_responded_at),
      'invoiceCreated', false,
      'invoiceId', v_invoice_id
    );
  END IF;

  v_issue_date := timezone('Asia/Kolkata', now())::date;
  SELECT COALESCE(default_payment_terms_days, 15)
    INTO v_payment_terms_days
    FROM public.organizations
   WHERE id = v_quote.org_id;
  v_payment_terms_days := GREATEST(0, LEAST(COALESCE(v_payment_terms_days, 15), 3650));

  INSERT INTO public.invoices (
    org_id, client_id, quotation_id, issue_date, due_date, status, notes, terms
  )
  VALUES (
    v_quote.org_id,
    v_quote.client_id,
    v_quote.id,
    v_issue_date,
    v_issue_date + v_payment_terms_days,
    'pending',
    v_quote.notes,
    v_quote.terms
  )
  RETURNING id INTO v_invoice_id;

  FOR v_item IN
    SELECT * FROM public.quotation_items
     WHERE quotation_id = v_quote.id AND org_id = v_quote.org_id
     ORDER BY position, id
  LOOP
    IF v_item.product_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.products AS product
       WHERE product.id = v_item.product_id AND product.org_id = v_quote.org_id
    ) THEN
      RAISE EXCEPTION 'A quotation item refers to a product outside this organization.'
        USING ERRCODE = '23514';
    END IF;

    IF v_item.quantity IS NULL OR v_item.quantity <= 0
       OR v_item.unit_price IS NULL OR v_item.unit_price < 0
       OR COALESCE(v_item.discount_pct, 0) < 0 OR COALESCE(v_item.discount_pct, 0) > 100
       OR COALESCE(v_item.gst_rate, 0) < 0 OR COALESCE(v_item.gst_rate, 0) > 100 THEN
      RAISE EXCEPTION 'The quotation contains an invalid quantity, price, discount, or GST value.'
        USING ERRCODE = '23514';
    END IF;

    INSERT INTO public.invoice_items (
      org_id, invoice_id, position, product_id, description,
      hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
    )
    VALUES (
      v_quote.org_id, v_invoice_id, v_position, v_item.product_id, v_item.description,
      v_item.hsn_sac, COALESCE(NULLIF(v_item.unit, ''), 'unit'),
      v_item.quantity, v_item.unit_price, COALESCE(v_item.discount_pct, 0),
      COALESCE(v_item.gst_rate, 0)
    );
    v_position := v_position + 1;
  END LOOP;

  IF v_position = 0 THEN
    RAISE EXCEPTION 'Cannot convert a quotation without any line items.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.quotations
     SET status = 'converted'
   WHERE id = v_quote.id
     AND org_id = v_quote.org_id
     AND status::text IN ('sent', 'accepted');

  IF NOT FOUND THEN
    RAISE EXCEPTION 'The quotation changed while the invoice was being created.'
      USING ERRCODE = '40001';
  END IF;

  UPDATE public.document_share_tokens
     SET response_status = 'accepted',
         responded_at = COALESCE(responded_at, v_responded_at)
   WHERE id = v_token.id;

  RETURN jsonb_build_object(
    'success', true,
    'responseStatus', 'accepted',
    'respondedAt', v_responded_at,
    'invoiceCreated', true,
    'invoiceId', v_invoice_id
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
  tbl name;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        SELECT c.relname INTO tbl FROM pg_catalog.pg_class c WHERE c.oid = cmd.objid;
        EXECUTE format('alter table if exists %I.%I enable row level security', cmd.schema_name, tbl);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$

CREATE OR REPLACE FUNCTION public.save_invoice_with_items(p_org_id uuid, p_document_id uuid, p_invoice jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id uuid := p_document_id;
    v_client_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_discount_pct numeric;
    v_gst_rate numeric;
    v_existing_status text;
    v_requested_status text;
    v_discount_type text;
    v_discount_value numeric(14,2);
    v_shipping_charge numeric(14,2);
    v_round_off_mode text;
    v_round_off_value numeric(14,2);
    v_tds_rate numeric(5,2);
    v_tcs_rate numeric(5,2);
    v_position integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in before saving an invoice.' USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.org_members AS member
        WHERE member.org_id = p_org_id AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You do not belong to this organization.' USING ERRCODE = '42501';
    END IF;

    IF p_invoice IS NULL OR jsonb_typeof(p_invoice) <> 'object'
       OR (p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array') THEN
        RAISE EXCEPTION 'Invalid invoice payload.' USING ERRCODE = '22023';
    END IF;

    v_requested_status := lower(COALESCE(NULLIF(p_invoice->>'status', ''), 'draft'));
    v_discount_type := lower(COALESCE(NULLIF(p_invoice->>'discount_type', ''), 'percentage'));
    v_discount_value := COALESCE(NULLIF(p_invoice->>'discount_value', '')::numeric, 0);
    IF v_discount_type NOT IN ('percentage', 'fixed')
       OR v_discount_value < 0
       OR (v_discount_type = 'percentage' AND v_discount_value > 100) THEN
        RAISE EXCEPTION 'Discount mode or value is invalid.' USING ERRCODE = '23514';
    END IF;
    v_shipping_charge := COALESCE(NULLIF(p_invoice->>'shipping_charge', '')::numeric, 0);
    v_round_off_mode := lower(COALESCE(NULLIF(p_invoice->>'round_off_mode', ''), 'manual'));
    v_round_off_value := COALESCE(NULLIF(p_invoice->>'round_off_value', '')::numeric, 0);
    v_tds_rate := COALESCE(NULLIF(p_invoice->>'tds_rate', '')::numeric, 0);
    v_tcs_rate := COALESCE(NULLIF(p_invoice->>'tcs_rate', '')::numeric, 0);
    IF v_shipping_charge < 0 OR v_round_off_mode NOT IN ('manual', 'nearest_rupee')
       OR abs(v_round_off_value) > 1 OR v_tds_rate < 0 OR v_tds_rate > 100
       OR v_tcs_rate < 0 OR v_tcs_rate > 100 THEN
        RAISE EXCEPTION 'Shipping, round-off, TDS, or TCS values are invalid.' USING ERRCODE = '23514';
    END IF;
    IF v_requested_status NOT IN ('draft', 'pending') THEN
        RAISE EXCEPTION 'Invoice status must be draft or pending when saving.'
            USING ERRCODE = '23514';
    END IF;

    v_client_id := NULLIF(p_invoice->>'client_id', '')::uuid;
    IF v_client_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.clients AS client
        WHERE client.id = v_client_id AND client.org_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'The invoice client must belong to the same organization.' USING ERRCODE = '23514';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.invoices (
            org_id, client_id, issue_date, due_date, status, notes, discount_type, discount_value, shipping_charge, round_off_mode, round_off_value, tds_rate, tcs_rate
        )
        VALUES (
            p_org_id, v_client_id,
            COALESCE(NULLIF(p_invoice->>'issue_date', '')::date, CURRENT_DATE),
            NULLIF(p_invoice->>'due_date', '')::date,
            v_requested_status,
            NULLIF(p_invoice->>'notes', ''),
            v_discount_type, v_discount_value, v_shipping_charge, v_round_off_mode, v_round_off_value, v_tds_rate, v_tcs_rate
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT lower(invoice.status::text)
          INTO v_existing_status
          FROM public.invoices AS invoice
         WHERE invoice.id = v_id AND invoice.org_id = p_org_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice not found in this organization.';
        END IF;

        IF v_existing_status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft invoices can be edited. Duplicate or cancel an unpaid issued invoice before preparing a correction.'
                USING ERRCODE = '23514';
        END IF;

        UPDATE public.invoices
        SET client_id = v_client_id,
            issue_date = COALESCE(NULLIF(p_invoice->>'issue_date', '')::date, issue_date),
            due_date = NULLIF(p_invoice->>'due_date', '')::date,
            status = v_requested_status,
            notes = NULLIF(p_invoice->>'notes', ''),
            discount_type = v_discount_type,
            discount_value = v_discount_value,
            shipping_charge = v_shipping_charge,
            round_off_mode = v_round_off_mode,
            round_off_value = v_round_off_value,
            tds_rate = v_tds_rate,
            tcs_rate = v_tcs_rate
        WHERE id = v_id AND org_id = p_org_id AND lower(status::text) = 'draft';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Only draft invoices can be edited.' USING ERRCODE = '23514';
        END IF;

        DELETE FROM public.invoice_items
        WHERE invoice_id = v_id AND org_id = p_org_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
        v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1);
        v_unit_price := COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0);
        v_discount_pct := COALESCE(NULLIF(v_item->>'discount_pct', '')::numeric, 0);
        v_gst_rate := COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0);

        IF v_quantity <= 0 OR v_unit_price < 0
           OR v_discount_pct < 0 OR v_discount_pct > 100
           OR v_gst_rate < 0 OR v_gst_rate > 100 THEN
            RAISE EXCEPTION 'Invoice items contain invalid quantity, price, discount, or GST values.'
                USING ERRCODE = '23514';
        END IF;

        IF v_product_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.products AS product
            WHERE product.id = v_product_id AND product.org_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Every selected invoice product must belong to the same organization.'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.invoice_items (
            org_id, invoice_id, position, product_id, description,
            hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
        )
        VALUES (
            p_org_id, v_id, v_position, v_product_id,
            COALESCE(v_item->>'description', ''),
            NULLIF(v_item->>'hsn_sac', ''),
            COALESCE(NULLIF(v_item->>'unit', ''), 'unit'),
            v_quantity, v_unit_price, v_discount_pct, v_gst_rate
        );
        v_position := v_position + 1;
    END LOOP;

    RETURN v_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.save_quotation_with_items(p_org_id uuid, p_document_id uuid, p_quotation jsonb, p_items jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_id uuid := p_document_id;
    v_client_id uuid;
    v_item jsonb;
    v_product_id uuid;
    v_quantity numeric;
    v_unit_price numeric;
    v_discount_pct numeric;
    v_gst_rate numeric;
    v_requested_status text;
    v_existing_status text;
    v_discount_type text;
    v_discount_value numeric(14,2);
    v_shipping_charge numeric(14,2);
    v_round_off_mode text;
    v_round_off_value numeric(14,2);
    v_tds_rate numeric(5,2);
    v_tcs_rate numeric(5,2);
    v_position integer := 0;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in before saving a quotation.' USING ERRCODE = '42501';
    END IF;

    IF p_org_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.org_members AS member
        WHERE member.org_id = p_org_id AND member.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'You do not belong to this organization.' USING ERRCODE = '42501';
    END IF;

    IF p_quotation IS NULL OR jsonb_typeof(p_quotation) <> 'object'
       OR (p_items IS NOT NULL AND jsonb_typeof(p_items) <> 'array') THEN
        RAISE EXCEPTION 'Invalid quotation payload.' USING ERRCODE = '22023';
    END IF;

    v_requested_status := lower(COALESCE(NULLIF(p_quotation->>'status', ''), 'draft'));
    v_discount_type := lower(COALESCE(NULLIF(p_quotation->>'discount_type', ''), 'percentage'));
    v_discount_value := COALESCE(NULLIF(p_quotation->>'discount_value', '')::numeric, 0);
    IF v_discount_type NOT IN ('percentage', 'fixed')
       OR v_discount_value < 0
       OR (v_discount_type = 'percentage' AND v_discount_value > 100) THEN
        RAISE EXCEPTION 'Discount mode or value is invalid.' USING ERRCODE = '23514';
    END IF;
    v_shipping_charge := COALESCE(NULLIF(p_quotation->>'shipping_charge', '')::numeric, 0);
    v_round_off_mode := lower(COALESCE(NULLIF(p_quotation->>'round_off_mode', ''), 'manual'));
    v_round_off_value := COALESCE(NULLIF(p_quotation->>'round_off_value', '')::numeric, 0);
    v_tds_rate := COALESCE(NULLIF(p_quotation->>'tds_rate', '')::numeric, 0);
    v_tcs_rate := COALESCE(NULLIF(p_quotation->>'tcs_rate', '')::numeric, 0);
    IF v_shipping_charge < 0 OR v_round_off_mode NOT IN ('manual', 'nearest_rupee')
       OR abs(v_round_off_value) > 1 OR v_tds_rate < 0 OR v_tds_rate > 100
       OR v_tcs_rate < 0 OR v_tcs_rate > 100 THEN
        RAISE EXCEPTION 'Shipping, round-off, TDS, or TCS values are invalid.' USING ERRCODE = '23514';
    END IF;
    IF v_requested_status NOT IN ('draft', 'sent') THEN
        RAISE EXCEPTION 'Quotation status must be draft or sent when saving.'
            USING ERRCODE = '23514';
    END IF;

    v_client_id := NULLIF(p_quotation->>'client_id', '')::uuid;
    IF v_client_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.clients AS client
        WHERE client.id = v_client_id AND client.org_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'The quotation client must belong to the same organization.' USING ERRCODE = '23514';
    END IF;

    IF v_id IS NULL THEN
        INSERT INTO public.quotations (
            org_id, client_id, issue_date, valid_until, status, notes, terms, discount_type, discount_value, shipping_charge, round_off_mode, round_off_value, tds_rate, tcs_rate
        )
        VALUES (
            p_org_id, v_client_id,
            COALESCE(NULLIF(p_quotation->>'issue_date', '')::date, CURRENT_DATE),
            NULLIF(p_quotation->>'valid_until', '')::date,
            v_requested_status::public.quotation_status,
            NULLIF(p_quotation->>'notes', ''),
            NULLIF(p_quotation->>'terms', ''),
            v_discount_type, v_discount_value, v_shipping_charge, v_round_off_mode, v_round_off_value, v_tds_rate, v_tcs_rate
        )
        RETURNING id INTO v_id;
    ELSE
        SELECT lower(quotation.status::text)
          INTO v_existing_status
          FROM public.quotations AS quotation
         WHERE quotation.id = v_id AND quotation.org_id = p_org_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Quotation not found in this organization.';
        END IF;

        IF v_existing_status <> 'draft' THEN
            RAISE EXCEPTION 'Only draft quotations can be edited. Duplicate an issued quotation to create a revision.'
                USING ERRCODE = '23514';
        END IF;

        UPDATE public.quotations
        SET client_id = v_client_id,
            issue_date = COALESCE(NULLIF(p_quotation->>'issue_date', '')::date, issue_date),
            valid_until = NULLIF(p_quotation->>'valid_until', '')::date,
            status = v_requested_status::public.quotation_status,
            notes = NULLIF(p_quotation->>'notes', ''),
            terms = NULLIF(p_quotation->>'terms', ''),
            discount_type = v_discount_type,
            discount_value = v_discount_value,
            shipping_charge = v_shipping_charge,
            round_off_mode = v_round_off_mode,
            round_off_value = v_round_off_value,
            tds_rate = v_tds_rate,
            tcs_rate = v_tcs_rate
        WHERE id = v_id AND org_id = p_org_id AND lower(status::text) = 'draft';

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Only draft quotations can be edited.' USING ERRCODE = '23514';
        END IF;

        DELETE FROM public.quotation_items
        WHERE quotation_id = v_id AND org_id = p_org_id;
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
    LOOP
        v_product_id := NULLIF(v_item->>'product_id', '')::uuid;
        v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1);
        v_unit_price := COALESCE(NULLIF(v_item->>'unit_price', '')::numeric, 0);
        v_discount_pct := COALESCE(NULLIF(v_item->>'discount_pct', '')::numeric, 0);
        v_gst_rate := COALESCE(NULLIF(v_item->>'gst_rate', '')::numeric, 0);

        IF v_quantity <= 0 OR v_unit_price < 0
           OR v_discount_pct < 0 OR v_discount_pct > 100
           OR v_gst_rate < 0 OR v_gst_rate > 100 THEN
            RAISE EXCEPTION 'Quotation items contain invalid quantity, price, discount, or GST values.'
                USING ERRCODE = '23514';
        END IF;

        IF v_product_id IS NOT NULL AND NOT EXISTS (
            SELECT 1 FROM public.products AS product
            WHERE product.id = v_product_id AND product.org_id = p_org_id
        ) THEN
            RAISE EXCEPTION 'Every selected quotation product must belong to the same organization.'
                USING ERRCODE = '23514';
        END IF;

        INSERT INTO public.quotation_items (
            org_id, quotation_id, position, product_id, description,
            hsn_sac, unit, quantity, unit_price, discount_pct, gst_rate
        )
        VALUES (
            p_org_id, v_id, v_position, v_product_id,
            COALESCE(v_item->>'description', ''),
            NULLIF(v_item->>'hsn_sac', ''),
            COALESCE(NULLIF(v_item->>'unit', ''), 'unit'),
            v_quantity, v_unit_price, v_discount_pct, v_gst_rate
        );
        v_position := v_position + 1;
    END LOOP;

    RETURN v_id;
END;
$function$

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog'
AS $function$
begin new.updated_at = now(); return new; end $function$


-- Views and materialized views

-- Table grants copied from current role ACLs
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.audit_log TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.audit_log TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.clients TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.clients TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.document_counters TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.document_share_tokens TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.document_signatures TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.invitations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invitations TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.invoice_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_items TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoice_reminder_log TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.invoices TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.invoices TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.org_members TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.org_members TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organization_reminder_settings TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.organizations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.organizations TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.payments TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.payments TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.products TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.products TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.quotation_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quotation_items TO service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON TABLE public.quotations TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.quotations TO service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales_order_counters TO service_role;
GRANT SELECT ON TABLE public.sales_order_items TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales_order_items TO service_role;
GRANT SELECT ON TABLE public.sales_orders TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE public.sales_orders TO service_role;

-- Explicit function grants; defaults are revoked before grants are restored
REVOKE ALL ON FUNCTION public.accept_invitation(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.accept_quotation_create_sales_order(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_owner_member() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.audit_trigger() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_invoice_if_unpaid(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.convert_quotation_to_invoice(uuid, date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_invoice_payment_integrity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.enforce_invoice_payment_update_integrity() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.has_role(uuid, member_role[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iitem_calc() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.iitem_totals() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.initialize_org_reminder_settings() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invoice_before_save() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.invoice_refresh(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_member(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.manage_sales_order_action(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.next_doc_number(uuid, text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payment_after() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.payment_before() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.qitem_calc() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.qitem_totals() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.quotation_before_save() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_to_quotation_and_convert_to_invoice(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.accept_quotation_create_sales_order(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.add_owner_member() TO service_role;
GRANT EXECUTE ON FUNCTION public.audit_trigger() TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_if_unpaid(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_invoice_if_unpaid(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_invoice_payment_integrity() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_invoice_payment_update_integrity() TO service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, member_role[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, member_role[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.iitem_calc() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.iitem_calc() TO anon;
GRANT EXECUTE ON FUNCTION public.iitem_calc() TO authenticated;
GRANT EXECUTE ON FUNCTION public.iitem_calc() TO service_role;
GRANT EXECUTE ON FUNCTION public.iitem_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.initialize_org_reminder_settings() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_before_save() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.invoice_before_save() TO anon;
GRANT EXECUTE ON FUNCTION public.invoice_before_save() TO authenticated;
GRANT EXECUTE ON FUNCTION public.invoice_before_save() TO service_role;
GRANT EXECUTE ON FUNCTION public.invoice_refresh(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.manage_sales_order_action(uuid, uuid, text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_number(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_after() TO service_role;
GRANT EXECUTE ON FUNCTION public.payment_before() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.payment_before() TO anon;
GRANT EXECUTE ON FUNCTION public.payment_before() TO authenticated;
GRANT EXECUTE ON FUNCTION public.payment_before() TO service_role;
GRANT EXECUTE ON FUNCTION public.qitem_calc() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.qitem_calc() TO anon;
GRANT EXECUTE ON FUNCTION public.qitem_calc() TO authenticated;
GRANT EXECUTE ON FUNCTION public.qitem_calc() TO service_role;
GRANT EXECUTE ON FUNCTION public.qitem_totals() TO service_role;
GRANT EXECUTE ON FUNCTION public.quotation_before_save() TO PUBLIC;
GRANT EXECUTE ON FUNCTION public.quotation_before_save() TO anon;
GRANT EXECUTE ON FUNCTION public.quotation_before_save() TO authenticated;
GRANT EXECUTE ON FUNCTION public.quotation_before_save() TO service_role;
GRANT EXECUTE ON FUNCTION public.respond_to_quotation_and_convert_to_invoice(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.rls_auto_enable() TO service_role;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO service_role;

-- Row-level security
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_share_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_signatures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_reminder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "finance roles read audit" ON public.audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'accountant'::member_role]));
CREATE POLICY "members read clients" ON public.clients AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "staff write clients" ON public.clients AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role]));
CREATE POLICY "admins manage invites" ON public.invitations AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role]));
CREATE POLICY "read invoice items" ON public.invoice_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "write invoice items" ON public.invoice_items AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role]));
CREATE POLICY "read invoices" ON public.invoices AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "write invoices" ON public.invoices AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role]));
CREATE POLICY "owner manages members" ON public.org_members AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role]));
CREATE POLICY "read members" ON public.org_members AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "admins edit org" ON public.organizations AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(id, ARRAY['owner'::member_role, 'admin'::member_role]));
CREATE POLICY "create org" ON public.organizations AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK ((created_by = ( SELECT auth.uid() AS uid)));
CREATE POLICY "owner deletes org" ON public.organizations AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(id, ARRAY['owner'::member_role]));
CREATE POLICY "read org" ON public.organizations AS PERMISSIVE FOR SELECT TO authenticated USING ((is_member(id) OR (created_by = ( SELECT auth.uid() AS uid))));
CREATE POLICY "delete payments" ON public.payments AS PERMISSIVE FOR DELETE TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role]));
CREATE POLICY "edit payments" ON public.payments AS PERMISSIVE FOR UPDATE TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role]));
CREATE POLICY "read payments" ON public.payments AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "record payments" ON public.payments AS PERMISSIVE FOR INSERT TO authenticated WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'accountant'::member_role]));
CREATE POLICY "members read products" ON public.products AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "staff write products" ON public.products AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role]));
CREATE POLICY "read quotation items" ON public.quotation_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "write quotation items" ON public.quotation_items AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role]));
CREATE POLICY "read quotations" ON public.quotations AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY "write quotations" ON public.quotations AS PERMISSIVE FOR ALL TO authenticated USING (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role])) WITH CHECK (has_role(org_id, ARRAY['owner'::member_role, 'admin'::member_role, 'staff'::member_role]));
CREATE POLICY sales_order_items_member_read ON public.sales_order_items AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));
CREATE POLICY sales_orders_member_read ON public.sales_orders AS PERMISSIVE FOR SELECT TO authenticated USING (is_member(org_id));

-- Triggers
CREATE TRIGGER audit_clients AFTER INSERT OR DELETE OR UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER clients_updated BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER iitem_calc_trg BEFORE INSERT OR UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION iitem_calc();
CREATE TRIGGER iitem_totals_trg AFTER INSERT OR DELETE OR UPDATE ON invoice_items FOR EACH ROW EXECUTE FUNCTION iitem_totals();
CREATE TRIGGER audit_invoices AFTER INSERT OR DELETE OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER invoices_before BEFORE INSERT OR UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION invoice_before_save();
CREATE TRIGGER invoices_updated BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_members AFTER INSERT OR DELETE OR UPDATE ON org_members FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER audit_orgs AFTER INSERT OR DELETE OR UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER initialize_org_reminder_settings_trigger AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION initialize_org_reminder_settings();
CREATE TRIGGER org_owner_trg AFTER INSERT ON organizations FOR EACH ROW EXECUTE FUNCTION add_owner_member();
CREATE TRIGGER org_updated BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER audit_payments AFTER INSERT OR DELETE OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER enforce_invoice_payment_integrity_before_insert BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION enforce_invoice_payment_integrity();
CREATE TRIGGER enforce_invoice_payment_update_integrity_before_update BEFORE UPDATE OF invoice_id, org_id, amount ON payments FOR EACH ROW EXECUTE FUNCTION enforce_invoice_payment_update_integrity();
CREATE TRIGGER payment_after_trg AFTER INSERT OR DELETE OR UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION payment_after();
CREATE TRIGGER payment_before_trg BEFORE INSERT ON payments FOR EACH ROW EXECUTE FUNCTION payment_before();
CREATE TRIGGER audit_products AFTER INSERT OR DELETE OR UPDATE ON products FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER qitem_calc_trg BEFORE INSERT OR UPDATE ON quotation_items FOR EACH ROW EXECUTE FUNCTION qitem_calc();
CREATE TRIGGER qitem_totals_trg AFTER INSERT OR DELETE OR UPDATE ON quotation_items FOR EACH ROW EXECUTE FUNCTION qitem_totals();
CREATE TRIGGER audit_quotations AFTER INSERT OR DELETE OR UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION audit_trigger();
CREATE TRIGGER quotations_before BEFORE INSERT OR UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION quotation_before_save();
CREATE TRIGGER quotations_updated BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- End of schema baseline snapshot.
