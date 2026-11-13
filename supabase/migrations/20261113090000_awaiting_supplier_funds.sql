-- Paid orders the store's G2Bulk wallet can't cover wait instead of failing (2026-11-13).
-- New fulfillment status 'awaiting_supplier_funds': nothing was bought from the supplier, the
-- customer sees "being prepared", the admin sees "waiting for you to top up G2Bulk", and the
-- g2bulk-fulfill-cron retries these orders every 5 minutes (it buys only once the wallet covers
-- the order). Set by the g2bulk Edge Function.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('pending', 'skipped', 'fulfilling', 'fulfilled', 'failed',
                                'awaiting_delivery', 'awaiting_supplier_funds'));

ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_fulfillment_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_fulfillment_status_check
  CHECK (fulfillment_status IS NULL OR fulfillment_status IN ('pending', 'fulfilling', 'fulfilled', 'failed',
                                                              'awaiting_delivery', 'awaiting_supplier_funds'));

CREATE INDEX IF NOT EXISTS orders_awaiting_supplier_funds_idx
  ON public.orders (created_at) WHERE fulfillment_status = 'awaiting_supplier_funds';
