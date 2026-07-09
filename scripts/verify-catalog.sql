SELECT
  (SELECT count(*)::int FROM games) AS total_games,
  (SELECT count(*)::int FROM offers) AS total_offers,
  (SELECT count(*)::int FROM games WHERE parent_game_id IS NULL AND redemption_method = 'uid') AS topup_parents,
  (SELECT count(*)::int FROM games WHERE parent_game_id IS NOT NULL) AS region_children,
  (SELECT count(*)::int FROM games WHERE redemption_method = 'redeem_code') AS voucher_games,
  (SELECT count(*)::int FROM games WHERE catalog_segment = 'gaming_account') AS account_games,
  (SELECT count(*)::int FROM games WHERE catalog_segment = 'gift_card') AS gift_card_games;

SELECT name_en, region_label, g2bulk_game_code
FROM games
WHERE parent_game_id IS NOT NULL
  AND (name_en ILIKE '%valorant%' OR name_en ILIKE '%pubg%')
ORDER BY name_en
LIMIT 12;

SELECT name_en, slug
FROM games
WHERE parent_game_id IS NULL
  AND redemption_method = 'uid'
  AND (name_en ILIKE '%valorant%' OR name_en ILIKE '%pubg%')
ORDER BY name_en
LIMIT 8;