-- =============================================================================
-- ECHOCORE — MANUAL SHAMCASH ORDER PAYMENT MIGRATION
-- Run in Supabase SQL Editor after supabase_recharge_manual_migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORDERS — payment reference for ShamCash manual flow
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS orders_status_payment_method_idx
  ON public.orders (status, payment_method, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. CREATE ORDER — server-generated reference for ShamCash
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new_balance numeric;
  v_order_id uuid;
  v_item jsonb;
  v_offer_price numeric;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_manual_ready boolean := false;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_offer_price
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    IF ABS(v_offer_price - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_offer_price, (v_item->>'price')::numeric;
    END IF;

    v_server_total := v_server_total + v_offer_price;
  END LOOP;

  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    UPDATE profiles
    SET balance = balance - p_total
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance INTO v_new_balance FROM profiles WHERE id = p_user_id;

    IF p_payment_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT shamcash_enabled
          AND shamcash_qr_image_url IS NOT NULL
          AND length(trim(shamcash_qr_image_url)) > 0
          AND shamcash_pay_code IS NOT NULL
          AND length(trim(shamcash_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_manual_ready;

      IF NOT v_manual_ready THEN
        RAISE EXCEPTION 'Manual ShamCash payment is not configured yet';
      END IF;

      v_reference := 'ECHOCORE-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
        || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
    END IF;
  END IF;

  INSERT INTO orders (user_id, total, payment_method, status, payment_reference)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status, v_reference)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, offer_id, name_snapshot, price, quantity, player_uid, player_server)
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      COALESCE((v_item->>'quantity')::integer, 1),
      NULLIF(v_item->>'player_uid', ''),
      NULLIF(v_item->>'player_server', '')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance,
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. USER — mark ShamCash payment as sent (no auto-complete)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_order_payment_sent(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment';
  END IF;

  UPDATE public.orders
    SET status = 'payment_sent'
    WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'reference', v_order.payment_reference,
    'total', v_order.total,
    'status', 'payment_sent'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_order_payment_sent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_sent(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. ADMIN — confirm or reject external order payments
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id uuid,
  p_reference text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ref text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(nullif(trim(p_reference), ''), v_order.payment_reference);

  UPDATE public.orders
    SET status = 'completed'
    WHERE id = p_order_id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  SELECT
    v_order.user_id,
    'purchase',
    -v_order.total,
    p.balance,
    v_order.payment_method,
    v_ref,
    'completed'
  FROM public.profiles p
  WHERE p.id = v_order.user_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'completed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_order_payment(
  p_order_id uuid,
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting review';
  END IF;

  UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'cancelled',
    'note', nullif(trim(p_note), '')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, text) TO authenticated;