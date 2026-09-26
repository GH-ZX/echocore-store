-- =============================================================================
-- Migration: Resolve Supabase Database Linter Warnings Safely
-- =============================================================================

-- 1. Restore public.public_offers as a SECURITY DEFINER view (security_invoker = false)
-- This view acts as the security boundary: it exposes only safe storefront columns
-- while keeping sensitive supplier wholesale costs hidden from client browsers.
ALTER VIEW IF EXISTS public.public_offers SET (security_invoker = false);

CREATE OR REPLACE VIEW public.public_offers
WITH (security_invoker = false) AS
SELECT
  id, game_id, name_en, name_ar, price, amount, region,
  description_en, description_ar, active,
  sale_image_url, is_sale, original_price,
  image_url, image_custom, sale_image_custom,
  created_at,
  g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id,
  catalog_source, g2bulk_catalogue_id, g2bulk_synced_at,
  card_badge_en, card_badge_ar,
  instructions_en, instructions_ar
FROM public.offers;

GRANT SELECT ON public.public_offers TO anon, authenticated;

-- 2. Restore games table read access and safe column select on offers
GRANT SELECT ON TABLE public.games TO anon, authenticated;

GRANT SELECT (
  id, game_id, name_en, name_ar, price, amount, region,
  description_en, description_ar, active,
  sale_image_url, is_sale, original_price,
  image_url, image_custom, sale_image_custom,
  card_badge_en, card_badge_ar,
  created_at,
  g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id,
  catalog_source, g2bulk_catalogue_id, g2bulk_synced_at,
  pricing_mode, instructions_en, instructions_ar
) ON public.offers TO anon, authenticated;

-- 3. Fix Notification Not Found (P0001) Errors & Dismiss Access
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_row public.notifications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := public.is_admin();

  UPDATE public.notifications
    SET read_at = COALESCE(read_at, now())
    WHERE id = p_notification_id
      AND (user_id = v_user_id OR v_is_admin)
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.notifications
    WHERE id = p_notification_id
      AND (user_id = v_user_id OR v_is_admin);
  END IF;

  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('id', p_notification_id, 'readAt', now(), 'notFound', true);
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'readAt', v_row.read_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.dismiss_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_is_admin boolean := false;
  v_updated int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_is_admin := public.is_admin();

  UPDATE public.notifications
  SET
    bell_hidden_at = now(),
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND (user_id = v_user_id OR v_is_admin)
    AND bell_hidden_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dismiss_notification(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.dismiss_notification(uuid) TO authenticated, service_role;

-- 4. Fix Public Bucket Unrestricted Listing on product-images (Lint 0025)
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;

DROP POLICY IF EXISTS "Admins can list product-images" ON storage.objects;
CREATE POLICY "Admins can list product-images"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'product-images' 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 5. Fix Mutable Search Path on All Public Functions (Lint 0011)
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid, n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (
        p.proconfig IS NULL 
        OR NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')
      )
  LOOP
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = public', f.nspname, f.proname, f.args);
  END LOOP;
END $$;

ALTER FUNCTION public.telegram_escape(text) SET search_path = public;
ALTER FUNCTION public.telegram_alert_message(text, jsonb) SET search_path = public;
ALTER FUNCTION public.telegram_alert_link(text, jsonb) SET search_path = public;
ALTER FUNCTION public.assign_order_ref() SET search_path = public;
ALTER FUNCTION public.is_soft_fulfillment_error(text) SET search_path = public;
ALTER FUNCTION public.partner_price_from_cost(numeric, numeric) SET search_path = public;
ALTER FUNCTION public.influencer_price_from_public(numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.influencer_buyer_price(numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.influencer_commission_per_unit(numeric, numeric, numeric, numeric) SET search_path = public;

-- 6. Fix Anon Execution of Admin & Internal Functions (Lint 0028)
-- Revoke anon execution ONLY on functions not needed for public storefront operations or RLS
-- NOTE: keep any function in this list that a LOGGED-OUT visitor legitimately calls.
--   check_username_available -> src/views/auth/LoginView.jsx (pre-auth signup/login check)
--   log_client_error         -> src/main.jsx installGlobalErrorLogging (window.onerror for anon)
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND p.proname NOT IN (
        'is_admin',
        'get_site_status',
        'get_site_theme',
        'get_home_layout',
        'get_payment_methods',
        'get_bestselling_offer_ids',
        'get_approved_customer_reviews',
        'list_recent_purchase_activity',
        'submit_contact_message',
        'check_username_available',
        'log_client_error'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM anon, public', f.nspname, f.proname, f.args);
    IF f.proname NOT IN ('handle_new_user', 'assign_order_ref') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', f.nspname, f.proname, f.args);
    END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', f.nspname, f.proname, f.args);
  END LOOP;
END $$;

-- 7. Ensure Public & RLS Functions Are Granted to anon & authenticated
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_status() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_site_theme() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_home_layout() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_bestselling_offer_ids(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_approved_customer_reviews() TO anon, authenticated, service_role;

-- Pre-auth callers: must keep anon EXECUTE or the login screen + anon error
-- logging break. Re-granted explicitly so the allowlist above stays authoritative.
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon, authenticated, service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'list_recent_purchase_activity'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.list_recent_purchase_activity(integer) TO anon, authenticated, service_role';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'submit_contact_message'
  ) THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) TO anon, authenticated, service_role';
  END IF;
END $$;
