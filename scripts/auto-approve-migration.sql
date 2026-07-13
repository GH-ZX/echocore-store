-- =============================================================================
-- ECHOCORE STORE — g2bulk_auto_approve migration
-- =============================================================================
-- Run this ONCE in Supabase SQL Editor.
-- Idempotent: uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / CREATE OR REPLACE.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ADD COLUMN to store_settings
-- ---------------------------------------------------------------------------
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_approve boolean NOT NULL DEFAULT true;

-- ---------------------------------------------------------------------------
-- 2. UPDATE get_payment_methods (public) — returns g2bulkAutoApprove to client
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((SELECT shamcash_enabled FROM store_settings WHERE id = 1), false),
    'binance', COALESCE((SELECT binance_enabled FROM store_settings WHERE id = 1), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'ECHOCORE Store'),
    'shamcashQrImageUrl', (SELECT shamcash_qr_image_url FROM store_settings WHERE id = 1),
    'shamcashPayCode', (SELECT shamcash_pay_code FROM store_settings WHERE id = 1),
    'shamcashManualReady', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_qr_image_url IS NOT NULL
        AND length(trim(shamcash_qr_image_url)) > 0
        AND shamcash_pay_code IS NOT NULL
        AND length(trim(shamcash_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'rechargeMin', 5,
    'rechargeMax', 500,
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'walletMode', COALESCE((SELECT sam_wallet_mode FROM store_settings WHERE id = 1), 'manual'),
    'samApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_wallet_identifier IS NOT NULL
        AND length(trim(sam_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samInvoiceMethod', COALESCE((SELECT sam_invoice_method FROM store_settings WHERE id = 1), 'shamcash'),
    'samInvoiceCurrency', COALESCE((SELECT sam_invoice_currency FROM store_settings WHERE id = 1), 'USD'),
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true),
    'g2bulkCatalogMode', COALESCE((SELECT g2bulk_catalog_mode FROM store_settings WHERE id = 1), 'sync'),
    'g2bulkAutoApprove', COALESCE((SELECT g2bulk_auto_approve FROM store_settings WHERE id = 1), true),
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. UPDATE get_g2bulk_settings (admin-only) — includes new column
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_g2bulk_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.g2bulk_api_key), '');

  RETURN jsonb_build_object(
    'g2bulk_enabled', COALESCE(v_row.g2bulk_enabled, false),
    'g2bulk_markup_percent', COALESCE(v_row.g2bulk_markup_percent, 15),
    'g2bulk_charm_pricing_enabled', COALESCE(v_row.g2bulk_charm_pricing_enabled, false),
    'g2bulk_catalog_only', COALESCE(v_row.g2bulk_catalog_only, true),
    'g2bulk_catalog_mode', COALESCE(v_row.g2bulk_catalog_mode, 'sync'),
    'g2bulk_auto_approve', COALESCE(v_row.g2bulk_auto_approve, true),
    'g2bulk_last_sync_at', v_row.g2bulk_last_sync_at,
    'g2bulk_last_check_at', v_row.g2bulk_last_check_at,
    'g2bulk_check_summary', COALESCE(v_row.g2bulk_check_summary, '{}'::jsonb),
    'g2bulk_auto_sync_enabled', COALESCE(v_row.g2bulk_auto_sync_enabled, true),
    'g2bulk_auto_sync_hour', COALESCE(v_row.g2bulk_auto_sync_hour, 5),
    'g2bulk_auto_sync_timezone', COALESCE(v_row.g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    'g2bulk_pull_selection', COALESCE(v_row.g2bulk_pull_selection, '{}'::jsonb),
    'g2bulk_api_key_set', v_key IS NOT NULL,
    'g2bulk_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_g2bulk_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_g2bulk_settings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. UPDATE save_g2bulk_settings (admin-only) — adds p_auto_approve param
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_g2bulk_settings(
  p_enabled boolean,
  p_markup_percent numeric DEFAULT 15,
  p_api_key text DEFAULT null,
  p_catalog_only boolean DEFAULT null,
  p_auto_sync_enabled boolean DEFAULT null,
  p_auto_sync_hour smallint DEFAULT null,
  p_auto_sync_timezone text DEFAULT null,
  p_catalog_mode text DEFAULT null,
  p_charm_pricing_enabled boolean DEFAULT null,
  p_auto_approve boolean DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    g2bulk_enabled = COALESCE(p_enabled, false),
    g2bulk_markup_percent = COALESCE(p_markup_percent, 15),
    g2bulk_charm_pricing_enabled = COALESCE(p_charm_pricing_enabled, g2bulk_charm_pricing_enabled, false),
    g2bulk_catalog_only = COALESCE(p_catalog_only, g2bulk_catalog_only, true),
    g2bulk_catalog_mode = COALESCE(nullif(trim(p_catalog_mode), ''), g2bulk_catalog_mode, 'sync'),
    g2bulk_auto_sync_enabled = COALESCE(p_auto_sync_enabled, g2bulk_auto_sync_enabled, true),
    g2bulk_auto_sync_hour = COALESCE(p_auto_sync_hour, g2bulk_auto_sync_hour, 5),
    g2bulk_auto_sync_timezone = COALESCE(nullif(trim(p_auto_sync_timezone), ''), g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    g2bulk_auto_approve = COALESCE(p_auto_approve, g2bulk_auto_approve, true),
    g2bulk_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE g2bulk_api_key
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_g2bulk_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean, boolean) TO authenticated;
