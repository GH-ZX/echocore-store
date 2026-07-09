-- Game region grouping: one storefront game, many G2Bulk regional variants
-- Run in Supabase SQL Editor after g2bulk catalog migrations.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS parent_game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS region_label text;

CREATE INDEX IF NOT EXISTS games_parent_game_id_idx
  ON public.games (parent_game_id)
  WHERE parent_game_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS games_storefront_idx
  ON public.games (active, catalog_source)
  WHERE parent_game_id IS NULL;

COMMENT ON COLUMN public.games.parent_game_id IS 'Storefront parent; NULL = visible game card. Children hold g2bulk_game_code.';
COMMENT ON COLUMN public.games.region_label IS 'G2Bulk catalog region for child variants (e.g. SEA, Global, Turkey).';