-- Carousel order + visibility for home page game carousel
-- Run once in Supabase SQL Editor

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS carousel_order integer,
  ADD COLUMN IF NOT EXISTS show_in_carousel boolean DEFAULT true;

-- Backfill order from created_at for existing games
WITH ranked AS (
  SELECT id, row_number() OVER (ORDER BY created_at ASC) - 1 AS rn
  FROM public.games
  WHERE carousel_order IS NULL
)
UPDATE public.games g
SET carousel_order = ranked.rn
FROM ranked
WHERE g.id = ranked.id;

COMMENT ON COLUMN public.games.carousel_order IS 'Display order in home carousel (0 = first)';
COMMENT ON COLUMN public.games.show_in_carousel IS 'Whether game appears in home carousel';