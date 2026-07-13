-- Player charname for G2Bulk top-up games (order_items + RPCs).
-- Run: supabase db query --linked -f scripts/player-charname-migration.sql

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS player_charname text;

COMMENT ON COLUMN public.order_items.player_charname IS
  'In-game character name / extra identifier required by some G2Bulk top-up games.';


CREATE OR REPLACE FUNCTION public.admin_gift_order(
  p_target_user_id uuid,
  p_offer_id uuid,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_player_charname text DEFAULT null,
  p_gift_message text DEFAULT null,
  p_admin_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_order_id uuid;
  v_name_snapshot text;
  v_message text;
  v_admin_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_target_user_id IS NULL OR p_offer_id IS NULL THEN
    RAISE EXCEPTION 'Target user and offer are required';
  END IF;

  IF p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Cannot gift to yourself — use dev tools for testing';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot gift to another admin account';
  END IF;

  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_offer.active IS FALSE THEN
    RAISE EXCEPTION 'Offer is not active';
  END IF;

  v_name_snapshot := COALESCE(v_offer.name_en, v_offer.name_ar, 'Gift offer');
  v_message := nullif(trim(p_gift_message), '');

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'ECHOCORE')
  INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  INSERT INTO public.orders (
    user_id,
    total,
    payment_method,
    status,
    gift_message,
    gift_admin_note,
    gifted_by
  )
  VALUES (
    p_target_user_id,
    v_offer.price,
    'admin_gift',
    'completed',
    v_message,
    nullif(trim(p_admin_note), ''),
    v_admin_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
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
    v_offer.id,
    v_name_snapshot,
    v_offer.price,
    1,
    nullif(trim(p_player_uid), ''),
    nullif(trim(p_player_server), ''),
    nullif(trim(p_player_charname), '')
  );

  PERFORM public.notify_user(
    p_target_user_id,
    'order_gifted',
    jsonb_build_object(
      'orderId', v_order_id,
      'total', v_offer.price,
      'offerName', v_name_snapshot,
      'giftMessage', v_message,
      'giftedBy', v_admin_name
    ),
    '/success?orderId=' || v_order_id::text
  );

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'targetUserId', p_target_user_id,
    'offerId', v_offer.id,
    'offerName', v_name_snapshot,
    'total', v_offer.price,
    'status', 'completed',
    'giftMessage', v_message
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_gift_order(uuid, uuid, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_gift_order(uuid, uuid, text, text, text, text, text) TO authenticated;

-- §27 Canonical create_order_atomic
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

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- =============================================================================
