-- =============================================================================
-- ECHOCORE STORE — SECURITY MIGRATION
-- =============================================================================
-- Run this in Supabase SQL Editor on an existing project after the base schema.
-- Fixes: profile RLS, RPC caller verification, pending external payments,
--        and removal of unsafe client-side order/transaction inserts.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. PROFILE READ / UPDATE HARDENING
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Profiles readable" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;

CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

-- Avoid RLS recursion when checking admin role inside profile policies
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
    AND role = 'user'
    AND balance = 0
  );

DROP POLICY IF EXISTS "Users update own" ON public.profiles;
DROP POLICY IF EXISTS "Users update own name" ON public.profiles;
CREATE POLICY "Users update own name" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Prevent non-admins from changing role or balance even if a policy slips through
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- ---------------------------------------------------------------------------
-- 2. ORDERS / TRANSACTIONS — RPC-only writes
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Users create orders" ON public.orders;
DROP POLICY IF EXISTS "Users insert own order items" ON public.order_items;
DROP POLICY IF EXISTS "Users insert own transactions" ON public.transactions;

-- ---------------------------------------------------------------------------
-- 3. RPC CALLER VERIFICATION + SECURE PAYMENT FLOW
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.credit_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  new_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE public.profiles
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_user_id
    RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'recharge', p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.deduct_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'balance',
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  current_bal numeric;
  new_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduct amount must be positive';
  END IF;

  SELECT balance INTO current_bal FROM public.profiles WHERE id = p_user_id;
  IF current_bal IS NULL OR current_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.profiles
    SET balance = balance - p_amount
    WHERE id = p_user_id
    RETURNING balance INTO new_balance;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'purchase', -p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.deduct_user_balance(uuid, numeric, text, text) TO authenticated;


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
        v_item->>'offer_id', v_offer_price, v_item->>'price';
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
  END IF;

  INSERT INTO orders (user_id, total, payment_method, status)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status)
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
    'status', v_order_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;


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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

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
    p_reference,
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


-- ---------------------------------------------------------------------------
-- 4. PUBLIC STOREFRONT RPCs (same data for anon + logged-in users)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((SELECT shamcash_enabled FROM store_settings WHERE id = 1), false),
    'binance', COALESCE((SELECT binance_enabled FROM store_settings WHERE id = 1), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'ECHOCORE Store'),
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_site_theme()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    (SELECT theme FROM public.store_settings WHERE id = 1),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_site_theme() TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.get_home_layout()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    (SELECT home_layout FROM public.store_settings WHERE id = 1),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_home_layout() TO anon, authenticated;