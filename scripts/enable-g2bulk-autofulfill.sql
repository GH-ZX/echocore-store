-- Enable automatic G2Bulk fulfillment (run in Supabase SQL Editor)
-- Use when orders complete but stay "pending" / manual fulfillment was disabled.

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