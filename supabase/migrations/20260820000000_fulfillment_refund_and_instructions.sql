-- Fulfillment refund race mitigation + offer instructions + auto-refund toggle
-- Schema-only: the canonical function bodies (apply_g2bulk_fulfillment,
-- get_g2bulk_settings, save_g2bulk_settings) live in supabase_echocore_full.sql
-- (source of truth). This migration only adds the columns those functions rely on.

-- 1. Auto-refund toggle (default ON = current behavior)
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_refund_on_fail boolean NOT NULL DEFAULT true;

-- 2. Per-offer instructions (editable in admin, shown on product/buy/success pages)
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS instructions_en text,
  ADD COLUMN IF NOT EXISTS instructions_ar text;

-- 2b. Expose instructions through the storefront view (columns are explicit).
CREATE OR REPLACE VIEW public.public_offers AS
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

-- 3. Per-order fulfillment in-flight lock (serializes concurrent fulfillOrder
-- invocations so a wallet-guard failure can never race a purchase placement).
CREATE OR REPLACE FUNCTION public.acquire_order_fulfillment_lock(
  p_order_id uuid,
  p_token text,
  p_stale_seconds int DEFAULT 120
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_meta jsonb;
  v_active timestamptz;
BEGIN
  SELECT g2bulk_metadata INTO v_meta
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF v_meta IS NULL THEN
    RETURN false;
  END IF;

  IF v_meta ? 'in_flight' THEN
    BEGIN
      v_active := (v_meta->'in_flight'->>'started_at')::timestamptz;
    EXCEPTION WHEN OTHERS THEN
      v_active := NULL;
    END;
    IF v_active IS NOT NULL
       AND v_active > now() - make_interval(secs => p_stale_seconds)
    THEN
      RETURN false;
    END IF;
  END IF;

  UPDATE public.orders
  SET g2bulk_metadata = COALESCE(v_meta, '{}'::jsonb) || jsonb_build_object(
    'in_flight', jsonb_build_object('token', p_token, 'started_at', now())
  )
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_order_fulfillment_lock(
  p_order_id uuid,
  p_token text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_meta jsonb;
BEGIN
  SELECT g2bulk_metadata INTO v_meta
  FROM public.orders
  WHERE id = p_order_id;

  IF v_meta IS NULL OR v_meta->'in_flight'->>'token' IS DISTINCT FROM p_token THEN
    RETURN false;
  END IF;

  UPDATE public.orders
  SET g2bulk_metadata = v_meta - 'in_flight'
  WHERE id = p_order_id;

  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.acquire_order_fulfillment_lock(uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.acquire_order_fulfillment_lock(uuid, text, int) TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_order_fulfillment_lock(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.release_order_fulfillment_lock(uuid, text) TO service_role;