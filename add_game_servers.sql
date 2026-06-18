-- =====================================================
-- ADD SERVERS / REGIONS LIST TO GAMES
-- Admins define selectable servers per game (Europe, Turkey, Global, Korea, etc.)
-- Users will pick from dropdown in the Buy flow
-- =====================================================

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS servers jsonb DEFAULT '[]'::jsonb;

-- Example data you can run manually:
-- UPDATE games SET servers = '["Global", "Europe", "Turkey", "Korea", "NA", "SEA", "LATAM"]' WHERE slug = 'mobile-legends';

COMMENT ON COLUMN public.games.servers IS 'Array of selectable server/region names for this game (used in UID top-up form)';

-- Make sure games table still has public read (already does)
