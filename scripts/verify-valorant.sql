SELECT name_en, region_label, g2bulk_game_code
FROM games
WHERE parent_game_id IS NOT NULL
  AND (name_en ILIKE '%valorant%' OR name_en ILIKE '%pubg%')
ORDER BY name_en, region_label;

SELECT count(*)::int AS parents_with_code
FROM games
WHERE parent_game_id IS NULL
  AND redemption_method = 'uid'
  AND catalog_source = 'g2bulk'
  AND g2bulk_game_code IS NOT NULL;