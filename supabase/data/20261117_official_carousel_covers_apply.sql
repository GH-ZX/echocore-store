-- Official carousel covers (2026-11-17) — APPLY
-- Run ONLY after the site deploy that ships the new public/game-covers/*.webp
-- is live (check https://www.echocore412.com/game-covers/mlbb.webp loads first).
--
-- 12 carousel games already point at /game-covers/<slug>.webp, so the new
-- official art reaches them with the deploy alone. This script:
--   1. snapshots every game's images (undo: 20261117_official_carousel_covers_revert.sql)
--   2. points mlbb, mlbb-global and honkai-star-rail at their new covers
--      (keeping the old square art as logo_url for the small cards)
--   3. re-centres the carousel focus point for the new art
--   4. fixes points_name for PUBG Mobile and Magic Chess (the cards and game
--      page now use the code map in src/lib/gameCurrency.js, this is for admin views)

INSERT INTO echocore_backup.game_image_snapshots (label, game_id, image_url, logo_url, image_custom, logo_custom)
SELECT '2026-11-17-before-official-covers', id, image_url, logo_url, image_custom, logo_custom
FROM public.games
WHERE NOT EXISTS (
  SELECT 1 FROM echocore_backup.game_image_snapshots WHERE label = '2026-11-17-before-official-covers'
);

UPDATE public.games g
SET logo_url = COALESCE(g.logo_url, CASE WHEN g.image_url LIKE 'https://api.g2bulk.com/%' THEN g.image_url END),
    image_url = 'https://www.echocore412.com/game-covers/' || g.slug || '.webp',
    image_custom = true
WHERE g.slug IN ('mlbb', 'mlbb-global', 'honkai-star-rail');

UPDATE public.games
SET carousel_focus_x = 50, carousel_focus_y = 45
WHERE slug IN (
  'mlbb', 'mlbb-global', 'pubgm', 'genshin', 'nte', 'lds', 'bloodstrike', 'honkai-star-rail',
  'wuwa', 'magic-chess-gogo', 'freefire-me', 'hok', 'deltaforce', 'arena-breakout', 'jawaker'
);

UPDATE public.games SET points_name = 'UC' WHERE slug = 'pubgm';
UPDATE public.games SET points_name = 'Diamonds' WHERE slug = 'magic-chess-gogo';
