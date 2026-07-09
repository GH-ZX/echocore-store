-- =============================================================================
-- ECHOCORE — G2BULK CATALOG SYNC MIGRATION
-- Run after supabase_g2bulk_migration.sql
-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_catalog_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS g2bulk_last_sync_at timestamptz;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS redemption_method text DEFAULT 'uid'
    CHECK (redemption_method IS NULL OR redemption_method IN ('uid', 'redeem_code', 'both')),
  ADD COLUMN IF NOT EXISTS catalog_source text NOT NULL DEFAULT 'manual'
    CHECK (catalog_source IN ('manual', 'g2bulk')),
  ADD COLUMN IF NOT EXISTS g2bulk_source_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_synced_at timestamptz;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS catalog_source text NOT NULL DEFAULT 'manual'
    CHECK (catalog_source IN ('manual', 'g2bulk')),
  ADD COLUMN IF NOT EXISTS g2bulk_catalogue_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS games_g2bulk_game_code_uidx
  ON public.games (g2bulk_game_code)
  WHERE g2bulk_game_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_g2bulk_product_uidx
  ON public.offers (g2bulk_product_id)
  WHERE g2bulk_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_game_catalogue_uidx
  ON public.offers (game_id, g2bulk_catalogue_name)
  WHERE g2bulk_catalogue_name IS NOT NULL;

-- Storefront flag (public)
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
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- Admin G2Bulk settings (extended)
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
    'g2bulk_catalog_only', COALESCE(v_row.g2bulk_catalog_only, true),
    'g2bulk_last_sync_at', v_row.g2bulk_last_sync_at,
    'g2bulk_api_key_set', v_key IS NOT NULL,
    'g2bulk_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_g2bulk_settings(
  p_enabled boolean,
  p_markup_percent numeric DEFAULT 15,
  p_api_key text DEFAULT null,
  p_catalog_only boolean DEFAULT null
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
    g2bulk_catalog_only = COALESCE(p_catalog_only, g2bulk_catalog_only, true),
    g2bulk_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE g2bulk_api_key
    END,
    updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.store_settings (
      id, g2bulk_enabled, g2bulk_markup_percent, g2bulk_catalog_only, g2bulk_api_key
    )
    VALUES (
      1,
      COALESCE(p_enabled, false),
      COALESCE(p_markup_percent, 15),
      COALESCE(p_catalog_only, true),
      v_trim_key
    );
  END IF;

  RETURN public.get_g2bulk_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean) TO authenticated;