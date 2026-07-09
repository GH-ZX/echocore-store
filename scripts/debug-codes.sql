SELECT
  name_en,
  region_label,
  g2bulk_game_code,
  parent_game_id IS NOT NULL AS is_child
FROM games
WHERE redemption_method = 'uid'
  AND catalog_source = 'g2bulk'
  AND (name_en ILIKE '%valorant%' OR name_en ILIKE '%pubg%')
ORDER BY parent_game_id NULLS FIRST, region_label
LIMIT 20;

SELECT count(*)::int AS with_code FROM games WHERE g2bulk_game_code IS NOT NULL AND catalog_source = 'g2bulk';
SELECT count(*)::int AS without_code FROM games WHERE g2bulk_game_code IS NULL AND catalog_source = 'g2bulk' AND redemption_method = 'uid';