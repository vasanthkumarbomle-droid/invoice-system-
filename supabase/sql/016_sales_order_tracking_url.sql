-- Migration 016: store an optional HTTPS courier tracking link on sales orders.
ALTER TABLE public.sales_orders ADD COLUMN IF NOT EXISTS tracking_url text;

DROP FUNCTION IF EXISTS public.manage_sales_order_action(uuid, uuid, text, text, text);
CREATE OR REPLACE FUNCTION public.manage_sales_order_action(
  p_org_id uuid,
  p_order_id uuid,
  p_action text,
  p_carrier text DEFAULT NULL,
  p_tracking_number text DEFAULT NULL,
  p_tracking_url text DEFAULT NULL
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
    IF p_tracking_url IS NOT NULL AND btrim(p_tracking_url) <> ''
       AND btrim(p_tracking_url) !~* '^https://[^[:space:]]+
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
$$; THEN
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
$$;

REVOKE ALL ON FUNCTION public.manage_sales_order_action(uuid, uuid, text, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_sales_order_action(uuid, uuid, text, text, text, text)
  TO service_role;

COMMENT ON COLUMN public.sales_orders.tracking_url IS
  'HTTPS URL supplied by the shipping carrier; never inferred from a carrier name or tracking number.';
