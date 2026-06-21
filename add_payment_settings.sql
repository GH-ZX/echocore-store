-- =====================================================
-- ECHOCORE STORE — Payment settings (ShamCash API + method toggles)
-- Prefer setup_store_settings.sql (payments + theme in one file).
-- Use this file only if you already ran an older payments-only migration.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.store_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shamcash_enabled boolean NOT NULL DEFAULT false,
  shamcash_api_base_url text NOT NULL DEFAULT 'https://api.shamcash-api.com/v1',
  shamcash_api_token text,
  shamcash_account_id text,
  shamcash_merchant_name text DEFAULT 'ECHOCORE Store',
  binance_enabled boolean NOT NULL DEFAULT false,
  mastercard_enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz DEFAULT now()
);

INSERT INTO public.store_settings (id, shamcash_enabled, binance_enabled, mastercard_enabled)
VALUES (1, false, false, false)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

-- Admins: full read/write on payment settings (includes API token)
DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings"
  ON public.store_settings
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Public RPC — returns enabled flags only (no secrets)
CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((SELECT shamcash_enabled FROM store_settings WHERE id = 1), false),
    'binance', COALESCE((SELECT binance_enabled FROM store_settings WHERE id = 1), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'ECHOCORE Store'),
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;