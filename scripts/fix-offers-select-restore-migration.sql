-- =============================================================================
-- EMERGENCY FIX: restore public catalog reads on offers
-- The hide-offer-cost migration used column-only GRANTs after REVOKE SELECT.
-- Supabase/PostgREST needs table-level SELECT on offers or the whole table 401s
-- and the storefront appears empty (games ok, offers denied).
--
-- Apply: supabase db query --linked -f scripts/fix-offers-select-restore-migration.sql
-- =============================================================================

GRANT SELECT ON TABLE public.offers TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.offers TO authenticated;

-- Keep admin wholesale + unit-price RPCs (safe to re-run if already present)
-- Cost is again readable via PostgREST; client still strips secrets in app code.
-- Safer DB hide = view-based path (see hide-offer-cost-from-public-migration.sql notes).
