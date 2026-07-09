-- =============================================================================
-- ECHOCORE — G2BULK DAILY AUTO-SYNC (5:00 AM)
-- Run after supabase_g2bulk_catalog_migration.sql
-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_hour smallint NOT NULL DEFAULT 5
    CHECK (g2bulk_auto_sync_hour >= 0 AND g2bulk_auto_sync_hour <= 23),
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_timezone text NOT NULL DEFAULT 'Asia/Damascus',
  ADD COLUMN IF NOT EXISTS g2bulk_sync_state jsonb;

-- Admin settings (extended)
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
    'g2bulk_auto_sync_enabled', COALESCE(v_row.g2bulk_auto_sync_enabled, true),
    'g2bulk_auto_sync_hour', COALESCE(v_row.g2bulk_auto_sync_hour, 5),
    'g2bulk_auto_sync_timezone', COALESCE(v_row.g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    'g2bulk_api_key_set', v_key IS NOT NULL,
    'g2bulk_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean);

CREATE OR REPLACE FUNCTION public.save_g2bulk_settings(
  p_enabled boolean,
  p_markup_percent numeric DEFAULT 15,
  p_api_key text DEFAULT null,
  p_catalog_only boolean DEFAULT null,
  p_auto_sync_enabled boolean DEFAULT null,
  p_auto_sync_hour smallint DEFAULT null,
  p_auto_sync_timezone text DEFAULT null
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
    g2bulk_auto_sync_enabled = COALESCE(p_auto_sync_enabled, g2bulk_auto_sync_enabled, true),
    g2bulk_auto_sync_hour = COALESCE(p_auto_sync_hour, g2bulk_auto_sync_hour, 5),
    g2bulk_auto_sync_timezone = COALESCE(nullif(trim(p_auto_sync_timezone), ''), g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    g2bulk_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE g2bulk_api_key
    END,
    updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.store_settings (
      id,
      g2bulk_enabled,
      g2bulk_markup_percent,
      g2bulk_catalog_only,
      g2bulk_auto_sync_enabled,
      g2bulk_api_key
    )
    VALUES (
      1,
      COALESCE(p_enabled, false),
      COALESCE(p_markup_percent, 15),
      COALESCE(p_catalog_only, true),
      COALESCE(p_auto_sync_enabled, true),
      v_trim_key
    );
  END IF;

  RETURN public.get_g2bulk_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- pg_cron: invoke g2bulk-sync-cron every 2 minutes
-- Requires: pg_cron + pg_net extensions (enabled on Supabase hosted)
-- Before running: store the same secret in Vault AND Edge Function secrets:
--   select vault.create_secret('YOUR_RANDOM_CRON_SECRET', 'g2bulk_cron_secret');
--   supabase secrets set G2BULK_CRON_SECRET=YOUR_RANDOM_CRON_SECRET
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'g2bulk-auto-sync-tick') THEN
    PERFORM cron.unschedule('g2bulk-auto-sync-tick');
  END IF;

  PERFORM cron.schedule(
    'g2bulk-auto-sync-tick',
    '*/2 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://uaiirtgzqtnrvcrlxstg.supabase.co/functions/v1/g2bulk-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-g2bulk-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'g2bulk_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
    $job$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'vault.decrypted_secrets not found — create g2bulk_cron_secret in Vault, then re-run the cron.schedule block.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule g2bulk auto-sync cron: %', SQLERRM;
END;
$cron$;