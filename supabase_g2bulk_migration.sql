-- =============================================================================
-- ECHOCORE — G2BULK FULFILLMENT MIGRATION
-- Run in Supabase SQL Editor after supabase_notifications_migration.sql
-- API key: save via Admin → G2Bulk (never commit the key to git)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORE SETTINGS — G2Bulk config (admin-only via RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS g2bulk_api_key text,
  ADD COLUMN IF NOT EXISTS g2bulk_markup_percent numeric(5,2) NOT NULL DEFAULT 15;

-- ---------------------------------------------------------------------------
-- 2. GAMES — link to G2Bulk game code for direct top-ups
-- ---------------------------------------------------------------------------

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS g2bulk_game_code text;

-- ---------------------------------------------------------------------------
-- 3. OFFERS — link to G2Bulk catalogue or voucher product
-- ---------------------------------------------------------------------------

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS g2bulk_type text CHECK (g2bulk_type IS NULL OR g2bulk_type IN ('topup', 'voucher')),
  ADD COLUMN IF NOT EXISTS g2bulk_catalogue_name text,
  ADD COLUMN IF NOT EXISTS g2bulk_product_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_cost_usd numeric(10,4);

-- ---------------------------------------------------------------------------
-- 4. ORDERS — fulfillment tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'skipped', 'fulfilling', 'fulfilled', 'failed')),
  ADD COLUMN IF NOT EXISTS g2bulk_order_id text,
  ADD COLUMN IF NOT EXISTS g2bulk_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx
  ON public.orders (fulfillment_status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. ORDER ITEMS — delivered codes / payload
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_items jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_status text
    CHECK (fulfillment_status IS NULL OR fulfillment_status IN ('pending', 'fulfilling', 'fulfilled', 'failed'));

-- ---------------------------------------------------------------------------
-- 6. ADMIN — read G2Bulk settings (includes api key for admin UI only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_g2bulk_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  v_key := nullif(trim(v_row.g2bulk_api_key), '');

  RETURN jsonb_build_object(
    'g2bulk_enabled', COALESCE(v_row.g2bulk_enabled, false),
    'g2bulk_markup_percent', COALESCE(v_row.g2bulk_markup_percent, 15),
    'g2bulk_api_key_set', v_key IS NOT NULL,
    'g2bulk_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_g2bulk_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_g2bulk_settings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. ADMIN — save G2Bulk settings (omit api key field to keep existing)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.save_g2bulk_settings(
  p_enabled boolean,
  p_markup_percent numeric DEFAULT 15,
  p_api_key text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    g2bulk_enabled = COALESCE(p_enabled, false),
    g2bulk_markup_percent = COALESCE(p_markup_percent, 15),
    g2bulk_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE g2bulk_api_key
    END,
    updated_at = now()
  WHERE id = 1;

  IF NOT FOUND THEN
    INSERT INTO public.store_settings (id, g2bulk_enabled, g2bulk_markup_percent, g2bulk_api_key)
    VALUES (1, COALESCE(p_enabled, false), COALESCE(p_markup_percent, 15), v_trim_key);
  END IF;

  RETURN public.get_g2bulk_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Persist fulfillment result (edge function uses service role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_g2bulk_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_g2bulk_order_id text DEFAULT null,
  p_delivery_items jsonb DEFAULT null,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_meta jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb);
  IF p_error IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('last_error', p_error, 'failed_at', now());
  END IF;

  UPDATE public.orders
  SET
    fulfillment_status = p_fulfillment_status,
    g2bulk_order_id = COALESCE(p_g2bulk_order_id, g2bulk_order_id),
    g2bulk_metadata = v_meta
  WHERE id = p_order_id;

  UPDATE public.order_items
  SET
    fulfillment_status = p_fulfillment_status,
    delivery_items = COALESCE(p_delivery_items, delivery_items)
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'fulfillmentStatus', p_fulfillment_status,
    'g2bulkOrderId', p_g2bulk_order_id,
    'deliveryItems', p_delivery_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;