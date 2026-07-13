-- Standalone migration: clear game servers (now using text input, not dropdown)
-- Run: supabase db query --file scripts/clear-game-servers.sql

-- Clear servers data from all games (both topup and voucher)
UPDATE public.games
SET servers = '[]'::jsonb
WHERE servers IS NOT NULL AND servers != '[]'::jsonb;
