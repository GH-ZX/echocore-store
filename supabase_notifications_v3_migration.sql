-- =============================================================================
-- ECHOCORE — NOTIFICATIONS V3 (retention, in-site inbox, dev wallet)
-- Run after supabase_notifications_v2_migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DEV TEST BALANCE TRACKING (clear mock money reliably)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dev_test_balance numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. NOTIFY USER — retention (in-site inbox only, no external email)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, metadata, link)
  VALUES (p_user_id, p_type, COALESCE(p_metadata, '{}'::jsonb), p_link)
  RETURNING id INTO v_id;

  -- Drop read notifications older than 14 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND read_at IS NOT NULL
    AND read_at < now() - interval '14 days';

  -- Drop any notification older than 30 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND created_at < now() - interval '30 days';

  -- Keep only the latest 40 notifications per user
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND id IN (
      SELECT id
      FROM public.notifications
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      OFFSET 40
    );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;


-- ---------------------------------------------------------------------------
-- 4. BALANCE PURCHASES — track spend from dev test pool
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
  v_dev_test_balance numeric := 0;
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
    SET
      balance = balance - p_total,
      dev_test_balance = GREATEST(0, dev_test_balance - p_total)
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance, dev_test_balance INTO v_new_balance, v_dev_test_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles WHERE id = p_user_id;

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
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, ''))
    );
  END LOOP;

  IF p_payment_method = 'balance' AND v_order_status = 'completed' THEN
    PERFORM public.notify_user(
      p_user_id,
      'purchase_completed',
      jsonb_build_object(
        'orderId', v_order_id,
        'total', p_total,
        'newBalance', v_new_balance
      ),
      '/success?orderId=' || v_order_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance,
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. DEV WALLET RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_dev_wallet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_admin_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'balance', v_row.balance,
    'devTestBalance', v_row.dev_test_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_dev_wallet() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_dev_wallet() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_credit_test_balance(p_amount numeric DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_new_balance numeric;
  v_dev_test_balance numeric;
  v_amount numeric := COALESCE(p_amount, 100);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_amount <= 0 OR v_amount > 1000 THEN
    RAISE EXCEPTION 'Test amount must be between 0.01 and 1000';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_admin_id,
    v_amount,
    'test',
    'DEV-TEST-' || to_char(now(), 'YYMMDDHH24MISS')
  );

  UPDATE public.profiles
  SET dev_test_balance = dev_test_balance + v_amount
  WHERE id = v_admin_id
  RETURNING dev_test_balance INTO v_dev_test_balance;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'amount', v_amount,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_clear_test_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_removed numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_admin_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_row.dev_test_balance, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'userId', v_admin_id,
      'removed', 0,
      'newBalance', v_row.balance,
      'devTestBalance', 0
    );
  END IF;

  v_removed := LEAST(v_row.balance, v_row.dev_test_balance);

  UPDATE public.profiles
  SET
    balance = GREATEST(0, balance - v_removed),
    dev_test_balance = 0
  WHERE id = v_admin_id
  RETURNING balance, dev_test_balance INTO v_row.balance, v_row.dev_test_balance;

  IF v_removed > 0 THEN
    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (
      v_admin_id,
      'adjustment',
      -v_removed,
      v_row.balance,
      'test',
      'DEV-CLEAR-' || to_char(now(), 'YYMMDDHH24MISS'),
      'completed'
    );
  END IF;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'removed', v_removed,
    'newBalance', v_row.balance,
    'devTestBalance', v_row.dev_test_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_test_balance() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clear_test_balance() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_run_mock_purchase(
  p_offer_id uuid,
  p_mock_code text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_balance numeric;
  v_dev_test numeric;
  v_needed numeric;
  v_order_result jsonb;
  v_order_id uuid;
  v_fulfill jsonb;
  v_items jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  SELECT balance, dev_test_balance
  INTO v_balance, v_dev_test
  FROM public.profiles WHERE id = v_admin_id FOR UPDATE;

  IF v_balance < v_offer.price THEN
    v_needed := ceil((v_offer.price - v_balance) * 100) / 100;
    PERFORM public.admin_credit_test_balance(v_needed);
  END IF;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'offer_id', v_offer.id,
      'name_snapshot', COALESCE(v_offer.name_en, v_offer.name_ar, 'Test offer'),
      'price', v_offer.price,
      'quantity', 1
    )
  );

  v_order_result := public.create_order_atomic(
    v_admin_id,
    v_offer.price,
    'balance',
    v_items
  );

  v_order_id := (v_order_result->>'orderId')::uuid;
  v_fulfill := public.admin_mock_fulfill_order(v_order_id, p_mock_code);

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'offerId', v_offer.id,
    'offerName', COALESCE(v_offer.name_en, v_offer.name_ar),
    'total', v_offer.price,
    'newBalance', v_order_result->'newBalance',
    'devTestBalance', v_order_result->'devTestBalance',
    'fulfillment', v_fulfill,
    'receiptPath', '/success?orderId=' || v_order_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) TO authenticated;