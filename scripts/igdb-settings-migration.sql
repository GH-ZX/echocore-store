-- IGDB (Twitch) credentials for admin game image search.
-- Stored in store_settings — not Vite env. Edge function `igdb` reads them.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS igdb_client_id text;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS igdb_client_secret text;

COMMENT ON COLUMN public.store_settings.igdb_client_id IS
  'Twitch/IGDB Client ID for game image search (admin UI).';
COMMENT ON COLUMN public.store_settings.igdb_client_secret IS
  'Twitch/IGDB Client Secret (admin UI only; never expose to anon).';
