-- Catalog segments: topup | gift_card | gaming_account
-- Platforms: Xbox, PS, iTunes, Razer Gold, Steam, Netflix, etc.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS catalog_segment text
    CHECK (catalog_segment IS NULL OR catalog_segment IN ('topup', 'gift_card', 'gaming_account'));

CREATE INDEX IF NOT EXISTS games_catalog_segment_idx
  ON public.games (catalog_segment)
  WHERE catalog_segment IS NOT NULL;

COMMENT ON COLUMN public.games.catalog_segment IS 'Storefront category: topup, gift_card (in-game codes), gaming_account (platform/subscription codes).';

-- Re-classify all G2Bulk voucher games from title.
UPDATE public.games
SET catalog_segment = CASE
  WHEN redemption_method <> 'redeem_code' THEN 'topup'
  WHEN lower(coalesce(name_en, name_ar, slug, '')) ~* (
    'xbox|playstation|psn|ps4|ps5|nintendo|game[[:space:]]?pass|gamepass|live[[:space:]]?gold|'
    || 'steam[[:space:]]?(wallet|card|gift|account)?|netflix|spotify|disney|hulu|prime[[:space:]]?video|'
    || 'amazon[[:space:]]?(gift|card)?|apple|itunes|app[[:space:]]?store|google[[:space:]]?play|'
    || 'razer|zgold|z[[:space:]]?gold|gold[[:space:]]?pin|paysafe|paysafecard|'
    || 'blizzard|battle\.?net|battlenet|epic[[:space:]]?games|origin|ea[[:space:]]?play|'
    || 'office|windows|chatgpt|discord[[:space:]]?nitro|vpn|subscription|membership|wallet[[:space:]]?code|store[[:space:]]?credit|account'
  ) THEN 'gaming_account'
  ELSE 'gift_card'
END
WHERE catalog_source = 'g2bulk'
  AND redemption_method = 'redeem_code';

UPDATE public.games
SET catalog_segment = 'topup'
WHERE catalog_source = 'g2bulk'
  AND redemption_method = 'uid'
  AND catalog_segment IS DISTINCT FROM 'topup';