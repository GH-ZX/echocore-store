SELECT
  (SELECT count(*)::int FROM games WHERE parent_game_id IS NULL AND redemption_method = 'uid' AND catalog_source = 'g2bulk') AS parents,
  (SELECT count(*)::int FROM games WHERE parent_game_id IS NOT NULL AND redemption_method = 'uid' AND catalog_source = 'g2bulk') AS children,
  (SELECT count(*)::int FROM games WHERE g2bulk_game_code IS NOT NULL AND redemption_method = 'uid' AND catalog_source = 'g2bulk') AS with_code,
  (SELECT count(*)::int FROM offers o JOIN games g ON g.id = o.game_id WHERE g.redemption_method = 'uid' AND g.catalog_source = 'g2bulk' AND o.active = true) AS topup_offers,
  (SELECT count(*)::int FROM games p WHERE p.parent_game_id IS NULL AND p.redemption_method = 'uid' AND p.catalog_source = 'g2bulk' AND NOT EXISTS (SELECT 1 FROM games c WHERE c.parent_game_id = p.id)) AS parents_no_children;