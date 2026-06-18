-- =====================================================
-- ADD PLAYER UID / SERVER FIELDS FOR TOP-UP REDEMPTION
-- Run after add_balance_transactions.sql
-- =====================================================

-- Store the player's in-game identifier when the game uses UID redemption
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS player_uid text,
  ADD COLUMN IF NOT EXISTS player_server text;

-- Optional: flexible json for future fields (zone, character name, etc.)
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS redemption_info jsonb;

-- No RLS change needed — inherits from existing order_items policies.

COMMENT ON COLUMN public.order_items.player_uid IS 'In-game UID / User ID provided by buyer for top-up';
COMMENT ON COLUMN public.order_items.player_server IS 'Server ID / Zone / Region ID (when game requires it)';

-- Example query later for admin:
-- SELECT oi.*, o.payment_method FROM order_items oi JOIN orders o ON ... WHERE player_uid IS NOT NULL;
