-- Remove the retired Sales Orders workflow while preserving invoices, quotations and inventory.
-- Existing reserved quantities live only on sales_order_items; dropping those rows releases
-- reservations without changing products.stock_qty. Previously deducted stock remains deducted.
BEGIN;

UPDATE public.invoices
   SET sales_order_id = NULL
 WHERE sales_order_id IS NOT NULL;

ALTER TABLE public.invoices
  DROP CONSTRAINT IF EXISTS invoices_sales_order_id_fkey;

DROP INDEX IF EXISTS public.idx_invoices_sales_order_id_fk;
DROP INDEX IF EXISTS public.invoices_one_per_sales_order;

ALTER TABLE public.invoices
  DROP COLUMN IF EXISTS sales_order_id;

DROP FUNCTION IF EXISTS public.accept_quotation_create_sales_order(uuid);
DROP FUNCTION IF EXISTS public.manage_sales_order_action(uuid, uuid, text, text, text, text);

DROP TABLE IF EXISTS public.sales_order_items;
DROP TABLE IF EXISTS public.sales_orders;
DROP TABLE IF EXISTS public.sales_order_counters;

COMMIT;
