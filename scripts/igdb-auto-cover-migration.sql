-- Optional auto-cover from IGDB when G2Bulk syncs games (admin toggle).
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS igdb_auto_cover_on_sync boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_settings.igdb_auto_cover_on_sync IS
  'When true and IGDB keys are set, G2Bulk sync fetches a cover via first name word and sets image_url (skips image_custom games).';
