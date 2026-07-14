-- Enable automatic G2Bulk fulfillment (run in Supabase SQL Editor)
-- Use when orders complete but stay "pending" / manual fulfillment was disabled.

-- PostgREST embed order_items → offers requires this FK (missing on some DBs).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'order_items_offer_id_fkey'
  ) THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT order_items_offer_id_fkey
      FOREIGN KEY (offer_id) REFERENCES public.offers(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

UPDATE public.store_settings
SET
  g2bulk_enabled = true,
  g2bulk_auto_approve = true,
  updated_at = now()
WHERE id = 1;

-- Diagnostic: current supplier settings + recent failed orders
SELECT
  g2bulk_enabled,
  g2bulk_auto_approve,
  g2bulk_markup_percent,
  (g2bulk_api_key IS NOT NULL AND length(trim(g2bulk_api_key)) > 0) AS api_key_in_db,
  g2bulk_last_sync_at
FROM public.store_settings
WHERE id = 1;

SELECT
  id,
  order_ref,
  status,
  fulfillment_status,
  payment_method,
  total,
  g2bulk_metadata->>'last_error' AS last_error,
  created_at
FROM public.orders
WHERE status = 'completed'
  AND fulfillment_status IN ('pending', 'failed', 'skipped')
ORDER BY created_at DESC
LIMIT 10;