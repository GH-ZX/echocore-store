-- Real brand logos for vouchers that had no supplier image (2026-10-19) — APPLY
-- Run only after the deploy shipping public/game-logos/*.webp is live.
-- Snapshot first (label '2026-10-19-before-brand-logos'); undo with:
--   select public.admin_restore_game_images('2026-10-19-before-brand-logos');

INSERT INTO echocore_backup.game_image_snapshots (label, game_id, image_url, logo_url, image_custom, logo_custom)
SELECT '2026-10-19-before-brand-logos', id, image_url, logo_url, image_custom, logo_custom FROM public.games;

UPDATE public.games g
SET logo_url = 'https://www.echocore412.com/game-logos/' || g.slug || '.webp',
    logo_custom = true
WHERE g.slug IN (
  'cards-115-xbox-gift-card-turkey', 'cards-45-psn-turkey', 'cards-139-razer-gold-turkey',
  'cards-145-netflix-saudi-arabia-ksa', 'cards-140-minecraft', 'cards-169-noon-uae',
  'cards-95-apple-itunes-turkey', 'cards-149-yalla-live', 'cards-3-itunes-usa'
);
