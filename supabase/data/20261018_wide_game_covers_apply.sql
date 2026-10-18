-- Wide 16:10 game covers (2026-10-18) — APPLY
-- Run ONLY after the site deploy that ships public/game-covers/*.webp is live
-- (check https://www.echocore412.com/game-covers/pubgm.webp loads first).
--
-- Snapshot taken beforehand: echocore_backup.game_image_snapshots
--   label '2026-10-18-before-wide-covers'. Undo: 20261018_wide_game_covers_revert.sql
--
-- image_custom = true so the daily G2Bulk sync keeps these covers.
-- logo_url (the square supplier art) is kept as the small game icon.

UPDATE public.games g
SET image_url = 'https://www.echocore412.com/game-covers/' || g.slug || '.webp',
    image_custom = true
FROM (VALUES
  ('cards-95-apple-itunes-turkey'),
  ('arena-breakout'),
  ('arena-breakout-infinite'),
  ('arknights-endfield'),
  ('bloodstrike'),
  ('bloodstrikeme'),
  ('deltaforce'),
  ('cards-17-discord'),
  ('freefire-eu'),
  ('freefire-me'),
  ('genshin'),
  ('hok'),
  ('cards-3-itunes-usa'),
  ('jawaker'),
  ('kingshot'),
  ('lds'),
  ('magic-chess-gogo'),
  ('marvelrivals'),
  ('cards-140-minecraft'),
  ('mlbb-exclusive'),
  ('mlbb-special'),
  ('cards-145-netflix-saudi-arabia-ksa'),
  ('nte'),
  ('cards-169-noon-uae'),
  ('oncehuman'),
  ('cards-18-playstation-saudi-arabia-ksa'),
  ('cards-45-psn-turkey'),
  ('pubgm'),
  ('rsm'),
  ('cards-4-razer-gold-giftcards'),
  ('cards-139-razer-gold-turkey'),
  ('cards-20-roblox-global'),
  ('starmaker'),
  ('cards-19-steam-global'),
  ('telegram'),
  ('wuwa'),
  ('cards-115-xbox-gift-card-turkey'),
  ('cards-149-yalla-live'),
  ('zzz')
) AS v(slug)
WHERE g.slug = v.slug
  AND COALESCE(g.image_custom, false) = false;
