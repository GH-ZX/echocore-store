-- Extended profile fields (contact, gaming prefs, default player ID)
-- Run in Supabase SQL Editor after supabase_profile_fields_migration.sql

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS favorite_game text,
  ADD COLUMN IF NOT EXISTS discord_username text,
  ADD COLUMN IF NOT EXISTS default_player_uid text;