-- =============================================================================
-- ECHOCORE — Sam API wallet migration (standalone)
-- =============================================================================
-- Run once in Supabase SQL Editor on an existing ECHOCORE project.
-- Requires: store_settings, is_admin(), get_payment_methods() already exist.
-- After SQL: deploy Edge Function  supabase/functions/sam-api
-- =============================================================================

-- 1. Store settings columns
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_api_key text,
  ADD COLUMN IF NOT EXISTS sam_api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sam_wallet_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sam_invoice_method text NOT NULL DEFAULT 'shamcash',
  ADD COLUMN IF NOT EXISTS sam_wallet_identifier text,
  ADD COLUMN IF NOT EXISTS sam_invoice_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS sam_webhook_secret text;

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_wallet_mode_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_wallet_mode_check
  CHECK (sam_wallet_mode IN ('manual', 'api'));

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_method_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_invoice_method_check
  CHECK (sam_invoice_method IN ('shamcash', 'syriatel'));

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_currency_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_invoice_currency_check
  CHECK (sam_invoice_currency IN ('USD', 'SYP', 'EUR'));

-- 2. Invoice tracking table
CREATE TABLE IF NOT EXISTS public.sam_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('recharge', 'order')),
  entity_id uuid,
  sam_invoice_id text NOT NULL UNIQUE,
  payment_url text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'SYP', 'EUR')),
  method text NOT NULL CHECK (method IN ('shamcash', 'syriatel')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  transaction_ref text,
  webhook_received_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sam_invoices_user_status_idx
  ON public.sam_invoices (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sam_invoices_entity_idx
  ON public.sam_invoices (entity_type, entity_id);

ALTER TABLE public.sam_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sam invoices" ON public.sam_invoices;
CREATE POLICY "Users read own sam invoices" ON public.sam_invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage sam invoices" ON public.sam_invoices;
CREATE POLICY "Admins manage sam invoices" ON public.sam_invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Admin RPCs (masked key — never returns full sk_)
CREATE OR REPLACE FUNCTION public.get_sam_api_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
  v_wh text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.sam_api_key), '');
  v_wh := nullif(trim(v_row.sam_webhook_secret), '');

  RETURN jsonb_build_object(
    'sam_api_enabled', COALESCE(v_row.sam_api_enabled, false),
    'sam_wallet_mode', COALESCE(v_row.sam_wallet_mode, 'manual'),
    'sam_invoice_method', COALESCE(v_row.sam_invoice_method, 'shamcash'),
    'sam_wallet_identifier', v_row.sam_wallet_identifier,
    'sam_invoice_currency', COALESCE(v_row.sam_invoice_currency, 'USD'),
    'sam_api_key_set', v_key IS NOT NULL,
    'sam_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END,
    'sam_webhook_secret_set', v_wh IS NOT NULL,
    'sam_webhook_secret_masked', CASE
      WHEN v_wh IS NULL THEN null
      WHEN length(v_wh) <= 8 THEN '********'
      ELSE substr(v_wh, 1, 6) || '…'
    END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_sam_api_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_sam_api_settings() TO authenticated;

DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean,
  p_wallet_mode text DEFAULT 'manual',
  p_invoice_method text DEFAULT 'shamcash',
  p_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD',
  p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false
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

  IF p_wallet_mode IS NOT NULL AND p_wallet_mode NOT IN ('manual', 'api') THEN
    RAISE EXCEPTION 'Invalid wallet mode';
  END IF;

  IF p_invoice_method IS NOT NULL AND p_invoice_method NOT IN ('shamcash', 'syriatel') THEN
    RAISE EXCEPTION 'Invalid invoice method';
  END IF;

  IF p_invoice_currency IS NOT NULL AND p_invoice_currency NOT IN ('USD', 'SYP', 'EUR') THEN
    RAISE EXCEPTION 'Invalid invoice currency';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    sam_api_enabled = COALESCE(p_enabled, false),
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_invoice_method = COALESCE(nullif(trim(p_invoice_method), ''), sam_invoice_method, 'shamcash'),
    sam_wallet_identifier = COALESCE(nullif(trim(p_wallet_identifier), ''), sam_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE sam_api_key
    END,
    sam_webhook_secret = CASE
      WHEN p_regenerate_webhook_secret THEN encode(gen_random_bytes(24), 'hex')
      WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN encode(gen_random_bytes(24), 'hex')
      ELSE sam_webhook_secret
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_sam_api_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean) TO authenticated;

-- 4. Public payment config (flags only — no API keys)
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
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- Done. Next: supabase functions deploy sam-api