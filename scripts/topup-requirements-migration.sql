-- Persist G2Bulk top-up field requirements on games (synced from /games/fields).
-- Run: supabase db query --linked -f scripts/topup-requirements-migration.sql

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS topup_fields jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS topup_notes text;

COMMENT ON COLUMN public.games.topup_fields IS
  'G2Bulk required input fields from POST /games/fields (e.g. ["userid"] or ["userid","serverid"]).';

COMMENT ON COLUMN public.games.topup_notes IS
  'G2Bulk notes from POST /games/fields (shown as checkout hints when relevant).';
