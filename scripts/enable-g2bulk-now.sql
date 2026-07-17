-- Unblock customer balance purchases: turn G2Bulk fulfillment ON.
-- Run: supabase db query --linked -f scripts/enable-g2bulk-now.sql

UPDATE public.store_settings
SET
  g2bulk_enabled = true,
  g2bulk_auto_approve = true,
  updated_at = now()
WHERE id = 1;

SELECT
  id,
  g2bulk_enabled,
  g2bulk_auto_approve,
  (g2bulk_api_key IS NOT NULL AND length(trim(g2bulk_api_key)) > 0) AS has_db_api_key,
  g2bulk_last_sync_at
FROM public.store_settings
WHERE id = 1;
