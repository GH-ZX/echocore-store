-- =============================================================================
-- Prevent double-spend when the same user opens multiple checkout tabs.
-- Serializes create_order_atomic per user; balance is locked and checked
-- before deducting. Second concurrent purchase fails with Insufficient balance.
-- =============================================================================

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
  v_current_balance numeric;
  v_order_id uuid;
  v_item jsonb;
  v_offer_price numeric;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Admins cannot purchase for themselves';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(p_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

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

  -- One checkout at a time per user (double-tab / double-click).
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    SELECT balance, dev_test_balance
    INTO v_current_balance, v_dev_test_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'User profile not found';
    END IF;

    IF v_current_balance < p_total THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    v_new_balance := v_current_balance - p_total;
    v_dev_test_balance := GREATEST(0, v_dev_test_balance - p_total);

    PERFORM set_config('echocore.allow_balance_change', '1', true);

    UPDATE profiles
    SET
      balance = v_new_balance,
      dev_test_balance = v_dev_test_balance
    WHERE id = p_user_id;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';

    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    SELECT COALESCE(sam_wallet_mode, 'manual') INTO v_wallet_mode
    FROM store_settings WHERE id = 1;

    IF p_payment_method = 'ShamCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_shamcash_wallet_identifier IS NOT NULL
            AND length(trim(sam_shamcash_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API ShamCash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT shamcash_enabled
            AND shamcash_qr_image_url IS NOT NULL
            AND length(trim(shamcash_qr_image_url)) > 0
            AND shamcash_pay_code IS NOT NULL
            AND length(trim(shamcash_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual ShamCash payment is not configured yet';
        END IF;

        v_reference := 'ECHOCORE-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    ELSIF p_payment_method = 'SyriatelCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_syriatel_wallet_identifier IS NOT NULL
            AND length(trim(sam_syriatel_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API Syriatel Cash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT syriatel_enabled
            AND syriatel_qr_image_url IS NOT NULL
            AND length(trim(syriatel_qr_image_url)) > 0
            AND syriatel_pay_code IS NOT NULL
            AND length(trim(syriatel_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual Syriatel Cash payment is not configured yet';
        END IF;

        v_reference := 'ECHOCORE-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    END IF;
  END IF;

  INSERT INTO orders (user_id, total, payment_method, status, payment_reference)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status, v_reference)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (
      order_id,
      offer_id,
      name_snapshot,
      price,
      quantity,
      player_uid,
      player_server,
      player_charname
    )
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      COALESCE((v_item->>'quantity')::integer, 1),
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, '')),
      NULLIF(v_item->>'player_charname', '')
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