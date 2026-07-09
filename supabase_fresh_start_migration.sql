-- =============================================================================
-- ECHOCORE — Fresh start (wipe storefront data, reset settings, keep schema + API key)
-- Run: supabase db query --linked -f supabase_fresh_start_migration.sql
-- Then deploy g2bulk and run full catalog sync from admin (or scripts/run-full-g2bulk-sync.ps1)
-- =============================================================================

BEGIN;

-- Commerce & catalog (order matters for FKs)
DELETE FROM public.order_items;
DELETE FROM public.orders;
DELETE FROM public.offers;
DELETE FROM public.games;

-- User activity
DELETE FROM public.transactions;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recharge_requests'
  ) THEN
    EXECUTE 'DELETE FROM public.recharge_requests';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    EXECUTE 'DELETE FROM public.notifications';
  END IF;
END $$;

DELETE FROM public.customer_reviews;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'contact_messages'
  ) THEN
    EXECUTE 'DELETE FROM public.contact_messages';
  END IF;
END $$;

-- Reset all wallet balances
UPDATE public.profiles SET balance = 0;

-- Reset store settings (keep g2bulk_api_key)
UPDATE public.store_settings
SET
  theme = '{}'::jsonb,
  home_layout = '[
    {"id":"carousel","type":"carousel","enabled":true},
    {"id":"games","type":"games","enabled":true,"title_en":"Choose a Game","title_ar":"اختر لعبتك"},
    {"id":"sale_offers","type":"sale_offers","enabled":true,"title_en":"Sale Offers","title_ar":"خصومات","limit":8},
    {"id":"suggested_offers","type":"suggested_offers","enabled":true,"title_en":"Suggested Offers","title_ar":"عروض مقترحة","limit":8},
    {"id":"gift_cards","type":"gift_cards","enabled":true,"title_en":"Gift Cards & Vouchers","title_ar":"بطاقات الهدايا","limit":6},
    {"id":"gaming_accounts","type":"gaming_accounts","enabled":true,"title_en":"Gaming Accounts","title_ar":"حسابات الألعاب","limit":6},
    {"id":"customer_reviews","type":"customer_reviews","enabled":true,"title_en":"Customer Reviews","title_ar":"آراء الزبائن","limit":8,"interval_seconds":6,"show_submit_form":true,"review_ids":[]}
  ]'::jsonb,
  shamcash_enabled = false,
  shamcash_api_token = null,
  shamcash_account_id = null,
  shamcash_qr_image_url = null,
  binance_enabled = false,
  mastercard_enabled = false,
  g2bulk_enabled = true,
  g2bulk_catalog_only = true,
  g2bulk_catalog_mode = 'sync',
  g2bulk_markup_percent = COALESCE(g2bulk_markup_percent, 15),
  g2bulk_auto_sync_enabled = COALESCE(g2bulk_auto_sync_enabled, true),
  g2bulk_auto_sync_hour = COALESCE(g2bulk_auto_sync_hour, 5),
  g2bulk_auto_sync_timezone = COALESCE(g2bulk_auto_sync_timezone, 'Asia/Damascus'),
  g2bulk_last_sync_at = null,
  g2bulk_last_check_at = null,
  g2bulk_check_summary = '{}'::jsonb,
  g2bulk_sync_state = null,
  updated_at = now()
WHERE id = 1;

COMMIT;

DO $$
BEGIN
  RAISE NOTICE 'Fresh start complete. Games/offers/orders cleared. Run G2Bulk full sync next.';
END $$;