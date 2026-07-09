SELECT
  (SELECT count(*)::int FROM games WHERE g2bulk_game_code IS NOT NULL AND catalog_source = 'g2bulk') AS with_code,
  (SELECT count(*)::int FROM games WHERE g2bulk_game_code IS NOT NULL AND parent_game_id IS NOT NULL) AS child_with_code,
  (SELECT count(*)::int FROM games WHERE g2bulk_game_code IS NOT NULL AND parent_game_id IS NULL) AS parent_with_code,
  (SELECT count(*)::int FROM games WHERE g2bulk_game_code IS NULL AND catalog_source = 'g2bulk' AND redemption_method = 'uid') AS uid_without_code;