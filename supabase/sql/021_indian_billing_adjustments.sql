-- India billing adjustments: shipping, round-off, TDS and TCS.
-- All adjustments are explicit, organization-scoped document fields. TDS/TCS are
-- calculated on the net taxable value by the database item-total triggers.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS shipping_charge numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS round_off_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_amount numeric(14,2) NOT NULL DEFAULT 0;

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS shipping_charge numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS round_off_value numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS round_off_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tds_amount numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_rate numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tcs_amount numeric(14,2) NOT NULL DEFAULT 0;

DO $$ BEGIN ALTER TABLE public.invoices ADD CONSTRAINT invoices_round_off_mode_check CHECK (round_off_mode IN ('manual','nearest_rupee')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.quotations ADD CONSTRAINT quotations_round_off_mode_check CHECK (round_off_mode IN ('manual','nearest_rupee')); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.invoices ADD CONSTRAINT invoices_adjustment_rates_check CHECK (shipping_charge >= 0 AND abs(round_off_value) <= 1 AND tds_rate BETWEEN 0 AND 100 AND tcs_rate BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE public.quotations ADD CONSTRAINT quotations_adjustment_rates_check CHECK (shipping_charge >= 0 AND abs(round_off_value) <= 1 AND tds_rate BETWEEN 0 AND 100 AND tcs_rate BETWEEN 0 AND 100); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.save_invoice_with_items(
    p_org_id uuid,
    p_document_id uuid,
    p_invoice jsonb,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_invoice_with_items(uuid, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_quotation_with_items(
    p_org_id uuid,
    p_document_id uuid,
    p_quotation jsonb,
    p_items jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_quotation_with_items(uuid, uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.iitem_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.qitem_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;
