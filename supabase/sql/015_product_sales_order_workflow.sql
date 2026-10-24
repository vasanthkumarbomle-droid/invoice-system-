-- Migration 015: product sales-order fulfillment workflow.
-- Accepting a quotation creates a sales order and reserves available stock.
-- Stock is deducted only when the owner generates the final tax invoice after dispatch.

CREATE TABLE IF NOT EXISTS public.sales_order_counters (
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  year integer NOT NULL,
  last_number integer NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  PRIMARY KEY (org_id, year)
);

CREATE TABLE IF NOT EXISTS public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  quotation_id uuid NOT NULL REFERENCES public.quotations(id) ON DELETE RESTRICT,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE RESTRICT,
  order_number text NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_stock'
    CHECK (status IN ('awaiting_stock','reserved','packing','packed','dispatched','invoiced','cancelled')),
  stock_status text NOT NULL DEFAULT 'manual_check'
    CHECK (stock_status IN ('reserved','backorder','manual_check','deducted','released')),
  payment_type text NOT NULL DEFAULT 'credit'
    CHECK (payment_type IN ('advance','cod','credit')),
  payment_terms text,
  advance_paid boolean NOT NULL DEFAULT false,
  carrier text,
  tracking_number text,
  shipping_notes text,
  stock_reserved_at timestamptz,
  packed_at timestamptz,
  dispatched_at timestamptz,
  stock_deducted_at timestamptz,
  invoice_generated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, quotation_id),
  UNIQUE (org_id, order_number)
);

CREATE TABLE IF NOT EXISTS public.sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sales_order_id uuid NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  sku text,
  description text NOT NULL,
  hsn_sac text,
  unit text DEFAULT 'pcs',
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  discount_pct numeric NOT NULL DEFAULT 0 CHECK (discount_pct >= 0 AND discount_pct <= 100),
  gst_rate numeric NOT NULL DEFAULT 0 CHECK (gst_rate >= 0 AND gst_rate <= 100),
  position integer NOT NULL DEFAULT 0,
  reserved_qty numeric NOT NULL DEFAULT 0 CHECK (reserved_qty >= 0 AND reserved_qty <= quantity),
  stock_status text NOT NULL DEFAULT 'manual_check'
    CHECK (stock_status IN ('reserved','awaiting_stock','backorder','manual_check','manual_confirmed','deducted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS sales_order_id uuid REFERENCES public.sales_orders(id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_sales_order
  ON public.invoices (org_id, sales_order_id)
  WHERE sales_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS sales_orders_org_created_idx
  ON public.sales_orders (org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sales_order_items_order_idx
  ON public.sales_order_items (org_id, sales_order_id, position);
CREATE INDEX IF NOT EXISTS sales_order_items_reserved_product_idx
  ON public.sales_order_items (org_id, product_id)
  WHERE reserved_qty > 0;

ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_items ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.sales_orders, public.sales_order_items TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_orders' AND policyname='sales_orders_member_read') THEN
    CREATE POLICY sales_orders_member_read ON public.sales_orders
      FOR SELECT TO authenticated USING (public.is_member(org_id));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='sales_order_items' AND policyname='sales_order_items_member_read') THEN
    CREATE POLICY sales_order_items_member_read ON public.sales_order_items
      FOR SELECT TO authenticated USING (public.is_member(org_id));
  END IF;
END $$;

-- The public client portal can call only through the trusted service-role Edge Function.
CREATE OR REPLACE FUNCTION public.accept_quotation_create_sales_order(p_token_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
$$;

REVOKE ALL ON FUNCTION public.accept_quotation_create_sales_order(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_quotation_create_sales_order(uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.manage_sales_order_action(
  p_org_id uuid,
  p_order_id uuid,
  p_action text,
  p_carrier text DEFAULT NULL,
  p_tracking_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
    UPDATE public.sales_orders
       SET status = 'dispatched',
           carrier = left(btrim(p_carrier), 120),
           tracking_number = left(btrim(p_tracking_number), 180),
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
$$;

REVOKE ALL ON FUNCTION public.manage_sales_order_action(uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_sales_order_action(uuid, uuid, text, text, text)
  TO service_role;
