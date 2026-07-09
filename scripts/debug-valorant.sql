SELECT c.name_en, c.region_label, c.g2bulk_game_code, count(o.id)::int AS offers
FROM games p
JOIN games c ON c.parent_game_id = p.id
LEFT JOIN offers o ON o.game_id = c.id AND o.active = true
WHERE p.slug = 'valorant'
GROUP BY c.name_en, c.region_label, c.g2bulk_game_code
ORDER BY c.region_label;