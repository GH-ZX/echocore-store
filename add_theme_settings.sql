-- =====================================================
-- ECHOCORE STORE — Global site theme (admin-controlled)
-- If you get "store_settings does not exist", run setup_store_settings.sql instead.
-- This file is safe to re-run after the table exists.
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
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS theme jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.store_settings (id, shamcash_enabled, binance_enabled, mastercard_enabled, theme)
VALUES (1, false, false, false, '{}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings"
  ON public.store_settings
  FOR ALL
  TO authenticated
  USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin')
  WITH CHECK ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

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