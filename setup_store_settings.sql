-- =====================================================
-- ECHOCORE STORE — Store settings (payments + global theme)
-- Run this ONCE in Supabase SQL Editor
-- Safe to re-run (idempotent)
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
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  home_layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Add theme column if table existed from an older migration
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS home_layout jsonb NOT NULL DEFAULT '[]'::jsonb;

INSERT INTO public.store_settings (id, shamcash_enabled, binance_enabled, mastercard_enabled, theme, home_layout)
VALUES (1, false, false, false, '{}'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings"
  ON public.store_settings
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- Public RPC — payment flags only (no secrets)
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

-- Public RPC — theme tokens (not secret)
CREATE OR REPLACE FUNCTION public.get_site_theme()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT theme FROM public.store_settings WHERE id = 1),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_site_theme() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_home_layout()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT home_layout FROM public.store_settings WHERE id = 1),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_home_layout() TO anon, authenticated;