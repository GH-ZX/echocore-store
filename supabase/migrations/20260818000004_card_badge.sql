-- =============================================================================
-- CARD BADGE (2026-08-18)
-- Admin-controlled per-card badge shown on grid cards (game + offer).
-- Empty in both languages = no badge. Mirrors the merged copy in
-- supabase_echocore_full.sql (games/offers CREATE TABLE + public_offers view
-- + offers column grants).
-- =============================================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS card_badge_en text,
  ADD COLUMN IF NOT EXISTS card_badge_ar text;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS card_badge_en text,
  ADD COLUMN IF NOT EXISTS card_badge_ar text;

-- Storefront offers view: expose the new safe columns. New columns are
-- APPENDED at the end so CREATE OR REPLACE VIEW works on the existing live
-- view (Postgres cannot reorder view columns).
CREATE OR REPLACE VIEW public.public_offers AS
SELECT
  id, game_id, name_en, name_ar, price, amount, region,
  description_en, description_ar, active,
  sale_image_url, is_sale, original_price,
  image_url, image_custom, sale_image_custom,
  created_at,
  g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id,
  catalog_source, g2bulk_catalogue_id, g2bulk_synced_at,
  card_badge_en, card_badge_ar
FROM public.offers;

GRANT SELECT ON public.public_offers TO anon, authenticated;

-- Re-apply the column-level SELECT grants (idempotent; adds the new columns).
REVOKE SELECT ON TABLE public.offers FROM anon, authenticated;
GRANT SELECT (
  id, game_id, name_en, name_ar, price, amount, region,
  description_en, description_ar, active,
  sale_image_url, is_sale, original_price,
  image_url, image_custom, sale_image_custom,
  card_badge_en, card_badge_ar,
  created_at,
  g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id,
  catalog_source, g2bulk_catalogue_id, g2bulk_synced_at,
  pricing_mode
) ON public.offers TO anon, authenticated;
