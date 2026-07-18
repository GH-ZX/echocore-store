-- =============================================================================
-- Lock admin-uploaded game cover/logo so G2Bulk catalog sync does not overwrite them.
-- Apply: supabase db query --linked -f scripts/game-custom-images-migration.sql
-- =============================================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS image_custom boolean NOT NULL DEFAULT false;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS logo_custom boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.games.image_custom IS 'When true, admin set cover (image_url); catalog sync must not overwrite.';
COMMENT ON COLUMN public.games.logo_custom IS 'When true, admin set logo_url; catalog sync must not overwrite.';

-- Backfill: anything hosted on our Supabase storage (or non-G2Bulk CDN) is treated as custom
UPDATE public.games
SET image_custom = true
WHERE image_custom = false
  AND image_url IS NOT NULL
  AND length(trim(image_url)) > 0
  AND (
    image_url ILIKE '%/storage/v1/object/%'
    OR image_url ILIKE '%product-images%'
    OR image_url ILIKE '%supabase.co%'
  )
  AND image_url NOT ILIKE '%g2bulk%';

UPDATE public.games
SET logo_custom = true
WHERE logo_custom = false
  AND logo_url IS NOT NULL
  AND length(trim(logo_url)) > 0
  AND (
    logo_url ILIKE '%/storage/v1/object/%'
    OR logo_url ILIKE '%product-images%'
    OR logo_url ILIKE '%supabase.co%'
  )
  AND logo_url NOT ILIKE '%g2bulk%';

-- Optional: offer sale/custom images (sale_image is already admin-only; keep flag for future)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS image_custom boolean NOT NULL DEFAULT false;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS sale_image_custom boolean NOT NULL DEFAULT false;

UPDATE public.offers
SET sale_image_custom = true
WHERE sale_image_custom = false
  AND sale_image_url IS NOT NULL
  AND length(trim(sale_image_url)) > 0;

UPDATE public.offers
SET image_custom = true
WHERE image_custom = false
  AND image_url IS NOT NULL
  AND length(trim(image_url)) > 0
  AND (
    image_url ILIKE '%/storage/v1/object/%'
    OR image_url ILIKE '%product-images%'
    OR image_url ILIKE '%supabase.co%'
  )
  AND image_url NOT ILIKE '%g2bulk%';
