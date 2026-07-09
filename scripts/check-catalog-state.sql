SELECT
  (SELECT count(*)::int FROM public.games) AS games_count,
  (SELECT count(*)::int FROM public.offers) AS offers_count,
  (SELECT count(*)::int FROM public.orders) AS orders_count,
  (SELECT count(*)::int FROM public.games WHERE parent_game_id IS NULL AND redemption_method = 'uid') AS topup_parents,
  (SELECT count(*)::int FROM public.games WHERE parent_game_id IS NOT NULL) AS region_children,
  (SELECT count(*)::int FROM public.games WHERE redemption_method = 'redeem_code') AS vouchers;

SELECT
  g2bulk_enabled,
  g2bulk_catalog_mode,
  g2bulk_catalog_only,
  g2bulk_last_sync_at,
  g2bulk_last_check_at,
  jsonb_array_length(COALESCE(home_layout, '[]'::jsonb)) AS home_sections,
  (theme = '{}'::jsonb) AS theme_reset,
  shamcash_enabled,
  binance_enabled,
  mastercard_enabled
FROM public.store_settings
WHERE id = 1;