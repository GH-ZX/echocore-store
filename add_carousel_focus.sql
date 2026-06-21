-- Carousel cover image focal point (where to center the crop)
-- Run once in Supabase SQL Editor

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS carousel_focus_x numeric(5,2) DEFAULT 50,
  ADD COLUMN IF NOT EXISTS carousel_focus_y numeric(5,2) DEFAULT 50;

COMMENT ON COLUMN public.games.carousel_focus_x IS 'Horizontal focal point for carousel cover (0=left, 100=right)';
COMMENT ON COLUMN public.games.carousel_focus_y IS 'Vertical focal point for carousel cover (0=top, 100=bottom)';