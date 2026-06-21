-- =====================================================
-- ECHOCORE STORE — Home page card sections layout
-- Run in Supabase SQL Editor (or use setup_store_settings.sql)
-- Safe to re-run
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

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS home_layout jsonb NOT NULL DEFAULT '[]'::jsonb;

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