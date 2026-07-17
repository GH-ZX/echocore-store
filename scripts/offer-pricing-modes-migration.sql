-- Offer pricing modes for G2Bulk sync protection
-- Run in Supabase SQL Editor on existing projects.

-- pricing_mode:
--   auto   = use store g2bulk_markup_percent on every sync
--   margin = use offer.pricing_margin_percent on every sync
--   fixed  = keep offer.price on sync (still update g2bulk_cost_usd)

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'auto';

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS pricing_margin_percent numeric(8,2);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'offers_pricing_mode_check'
  ) THEN
    ALTER TABLE public.offers
      ADD CONSTRAINT offers_pricing_mode_check
      CHECK (pricing_mode IN ('auto', 'margin', 'fixed'));
  END IF;
END $$;

COMMENT ON COLUMN public.offers.pricing_mode IS
  'auto = store markup on sync; margin = per-offer margin; fixed = lock customer price on sync';
COMMENT ON COLUMN public.offers.pricing_margin_percent IS
  'Used when pricing_mode = margin. Store default markup is used for auto.';

-- Sale offers: treat as price-locked for sync (handled in edge code via is_sale OR fixed).
-- Optional: migrate existing sale offers to fixed so intent is explicit.
UPDATE public.offers
SET pricing_mode = 'fixed'
WHERE is_sale = true
  AND pricing_mode = 'auto';
