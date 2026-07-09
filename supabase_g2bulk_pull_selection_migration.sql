-- G2Bulk selective pull: store which games/accounts to sync + carousel picks
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_pull_selection jsonb NOT NULL DEFAULT '{}'::jsonb;

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
    'g2bulk_catalog_mode', COALESCE(v_row.g2bulk_catalog_mode, 'sync'),
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