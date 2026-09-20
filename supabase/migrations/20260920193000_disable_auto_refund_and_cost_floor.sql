-- =============================================================================
-- Migration: Disable auto-refund on failure and enforce supplier wholesale cost floor
-- Prevents financial leakage from:
--   1. Auto-refunding customers while G2Bulk is still fulfilling a delayed top-up
--   2. Selling products below G2Bulk wholesale supplier cost
-- =============================================================================

-- 1. Disable auto-refund on failure by default in store_settings
ALTER TABLE public.store_settings
  ALTER COLUMN g2bulk_auto_refund_on_fail SET DEFAULT false;

UPDATE public.store_settings
  SET g2bulk_auto_refund_on_fail = false
  WHERE id = 1;

-- 2. Update apply_g2bulk_fulfillment to default v_auto_refund to false
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
  v_prev_status text;
  v_meta jsonb;
  v_has_uid boolean := false;
  v_has_codes boolean := false;
  v_codes jsonb := '[]'::jsonb;
  v_link text;
  v_new_balance numeric;
  v_refunded boolean := false;
  v_auto_refund boolean := false;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Auto-refund toggle: OFF keeps failed orders as-is so an admin handles them
  -- manually (top up G2Bulk wallet + re-fulfill, or manual refund).
  -- Default is now FALSE to prevent double delivery + refund leaks.
  SELECT COALESCE(g2bulk_auto_refund_on_fail, false) INTO v_auto_refund
  FROM public.store_settings WHERE id = 1;

  v_prev_status := v_order.fulfillment_status;

  -- Terminal-state guard: once fulfilled, never regress to failed
  IF v_prev_status = 'fulfilled' AND p_fulfillment_status = 'failed' THEN
    v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb)
      || COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'ignored_late_failure', true,
        'ignored_late_failure_at', now(),
        'ignored_late_failure_prev_g2bulk_order_id', v_order.g2bulk_order_id
      );
    UPDATE public.orders
    SET g2bulk_metadata = v_meta
    WHERE id = p_order_id;
    RETURN jsonb_build_object(
      'orderId', p_order_id,
      'fulfillmentStatus', v_prev_status,
      'g2bulkOrderId', v_order.g2bulk_order_id,
      'deliveryItems', null,
      'balanceRefunded', false,
      'ignoredLateFailure', true
    );
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

  IF p_fulfillment_status = 'fulfilling' THEN
    UPDATE public.order_items
    SET fulfillment_status = 'fulfilling'
    WHERE order_id = p_order_id
      AND fulfillment_status IS DISTINCT FROM 'fulfilled'
      AND fulfillment_status IS DISTINCT FROM 'skipped';
  ELSE
    UPDATE public.order_items
    SET
      fulfillment_status = p_fulfillment_status,
      delivery_items = COALESCE(p_delivery_items, delivery_items)
    WHERE order_id = p_order_id;
  END IF;

  v_link := '/invoice/order/' || p_order_id::text;

  IF p_fulfillment_status = 'fulfilled'
    AND v_prev_status IS DISTINCT FROM 'fulfilled'
    AND v_order.user_id IS NOT NULL
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND player_uid IS NOT NULL
        AND length(trim(player_uid)) > 0
    ) INTO v_has_uid;

    IF p_delivery_items IS NOT NULL AND jsonb_typeof(p_delivery_items) = 'array' THEN
      v_codes := p_delivery_items;
      v_has_codes := jsonb_array_length(v_codes) > 0;
    END IF;

    IF NOT v_has_codes THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(di) ORDER BY oi.id), '[]'::jsonb)
      INTO v_codes
      FROM public.order_items oi
      CROSS JOIN LATERAL jsonb_array_elements(
        CASE
          WHEN oi.delivery_items IS NULL THEN '[]'::jsonb
          WHEN jsonb_typeof(oi.delivery_items) = 'array' THEN oi.delivery_items
          ELSE jsonb_build_array(oi.delivery_items)
        END
      ) AS di
      WHERE oi.order_id = p_order_id;

      v_has_codes := COALESCE(jsonb_array_length(v_codes), 0) > 0;
    END IF;

    IF v_has_uid AND NOT v_has_codes THEN
      PERFORM public.notify_user(
        v_order.user_id,
        'topup_delivered',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'giftMessage', v_order.gift_message
        ),
        v_link
      );
    ELSIF v_has_codes THEN
      PERFORM public.notify_user(
        v_order.user_id,
        'delivery_ready',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'codes', v_codes,
          'giftMessage', v_order.gift_message
        ),
        v_link
      );
    ELSE
      PERFORM public.notify_user(
        v_order.user_id,
        'order_fulfilled',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'giftMessage', v_order.gift_message
        ),
        v_link
      );
    END IF;
  ELSIF p_fulfillment_status = 'failed'
    AND v_prev_status IS DISTINCT FROM 'failed'
    AND v_order.user_id IS NOT NULL
  THEN
    IF EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND delivery_items IS NOT NULL
        AND jsonb_typeof(delivery_items) = 'array'
        AND jsonb_array_length(delivery_items) > 0
    ) THEN
      v_meta := v_meta || jsonb_build_object(
        'refund_blocked_delivery_evidence', true,
        'refund_blocked_at', now()
      );
      UPDATE public.orders
      SET g2bulk_metadata = v_meta
      WHERE id = p_order_id;
      PERFORM public.notify_user(
        v_order.user_id,
        'fulfillment_failed',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'error', COALESCE(p_error, v_meta->>'last_error')
        ),
        v_link
      );
    ELSIF v_order.payment_method = 'balance'
       AND COALESCE((v_order.g2bulk_metadata->>'balance_refunded')::boolean, false) = false
    THEN
      IF NOT v_auto_refund THEN
        -- Auto-refund disabled: keep order as failed without touching customer wallet
        v_meta := v_meta || jsonb_build_object('auto_refund_skipped', true, 'auto_refund_skipped_at', now());
        UPDATE public.orders
        SET g2bulk_metadata = v_meta
        WHERE id = p_order_id;
        PERFORM public.notify_user(
          v_order.user_id,
          'fulfillment_failed',
          jsonb_build_object(
            'orderId', p_order_id,
            'amount', v_order.total,
            'error', COALESCE(p_error, v_meta->>'last_error')
          ),
          v_link
        );
      ELSE
        UPDATE public.profiles
        SET balance = COALESCE(balance, 0) + v_order.total
        WHERE id = v_order.user_id
        RETURNING balance INTO v_new_balance;

        INSERT INTO public.transactions (
          user_id, type, amount, balance_after, payment_method, reference, status
        )
        VALUES (
          v_order.user_id,
          'refund',
          v_order.total,
          v_new_balance,
          'balance',
          'FULFILL-REFUND-' || upper(left(replace(p_order_id::text, '-', ''), 8)),
          'completed'
        );

        v_meta := v_meta || jsonb_build_object(
          'balance_refunded', true,
          'refunded_at', now(),
          'refund_balance', v_new_balance
        );

        UPDATE public.orders
        SET g2bulk_metadata = v_meta
        WHERE id = p_order_id;

        v_refunded := true;

        PERFORM public.notify_user(
          v_order.user_id,
          'fulfillment_failed_refunded',
          jsonb_build_object(
            'orderId', p_order_id,
            'amount', v_order.total,
            'newBalance', v_new_balance,
            'error', COALESCE(p_error, v_meta->>'last_error')
          ),
          v_link
        );
      END IF;
    ELSE
      PERFORM public.notify_user(
        v_order.user_id,
        'fulfillment_failed',
        jsonb_build_object(
          'orderId', p_order_id,
          'amount', v_order.total,
          'error', COALESCE(p_error, v_meta->>'last_error')
        ),
        v_link
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'fulfillmentStatus', p_fulfillment_status,
    'g2bulkOrderId', p_g2bulk_order_id,
    'deliveryItems', p_delivery_items,
    'balanceRefunded', v_refunded,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;

-- 3. Update canonical create_order_atomic to enforce supplier wholesale cost floor
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_idempotency_key text DEFAULT null,
  p_influencer_code text DEFAULT null
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
  v_offer_active boolean;
  v_offer_cost numeric;
  v_qty integer;
  v_expected numeric;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
  v_idem text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_replay_order uuid;
  v_replay_status text;
  v_replay_ref text;
  v_partner_markup numeric := null;
  v_inf_coupon_id uuid := null;
  v_buyer_markup numeric := null;
  v_code text;
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

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Too many items in cart (max 20)';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  SELECT t.markup_percent INTO v_partner_markup
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id AND t.is_active = true
  WHERE p.id = p_user_id;

  IF v_partner_markup IS NULL THEN
    v_code := upper(trim(COALESCE(p_influencer_code, '')));
    v_code := regexp_replace(v_code, '\s+', '', 'g');
    IF v_code <> '' THEN
      SELECT c.id, c.buyer_markup_percent
      INTO v_inf_coupon_id, v_buyer_markup
      FROM public.influencer_coupons c
      WHERE upper(c.code) = v_code
        AND c.is_active = true
        AND (c.expires_at IS NULL OR c.expires_at >= now())
        AND c.influencer_user_id IS DISTINCT FROM p_user_id
        AND c.buyer_markup_percent IS NOT NULL;
    END IF;
  END IF;

  IF v_idem IS NOT NULL THEN
    SELECT pi.order_id, o.status, o.payment_reference, p.balance, COALESCE(p.dev_test_balance, 0)
    INTO v_replay_order, v_replay_status, v_replay_ref, v_new_balance, v_dev_test_balance
    FROM public.purchase_idempotency pi
    JOIN public.orders o ON o.id = pi.order_id
    JOIN public.profiles p ON p.id = p_user_id
    WHERE pi.user_id = p_user_id AND pi.key = v_idem;

    IF v_replay_order IS NOT NULL THEN
      RETURN jsonb_build_object(
        'orderId', v_replay_order,
        'newBalance', v_new_balance,
        'devTestBalance', v_dev_test_balance,
        'status', v_replay_status,
        'reference', v_replay_ref,
        'idempotentReplay', true
      );
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    SELECT price, COALESCE(active, true), g2bulk_cost_usd
    INTO v_offer_price, v_offer_active, v_offer_cost
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;
    IF v_offer_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Offer inactive: %', v_item->>'offer_id';
    END IF;

    IF v_partner_markup IS NOT NULL AND v_offer_cost IS NOT NULL AND v_offer_cost > 0 THEN
      v_expected := public.partner_price_from_cost(v_offer_cost, v_partner_markup);
      IF v_expected IS NULL OR v_expected > v_offer_price THEN
        v_expected := v_offer_price;
      END IF;
    ELSIF v_buyer_markup IS NOT NULL AND v_offer_cost IS NOT NULL AND v_offer_cost > 0 THEN
      v_expected := public.influencer_buyer_price(v_offer_price, v_offer_cost, v_buyer_markup);
      IF v_expected IS NULL THEN
        v_expected := v_offer_price;
      END IF;
    ELSE
      v_expected := v_offer_price;
    END IF;

    -- HARD INVARIANT: Selling below supplier wholesale cost is strictly forbidden
    IF v_offer_cost IS NOT NULL AND v_offer_cost > 0 AND v_expected < v_offer_cost THEN
      RAISE EXCEPTION 'Offer price (%) is below supplier wholesale cost (%) for offer %',
        v_expected, v_offer_cost, v_item->>'offer_id';
    END IF;

    IF ABS(v_expected - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_expected, v_item->>'price';
    END IF;

    v_server_total := v_server_total + (v_expected * v_qty);
  END LOOP;

  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

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
    SET balance = v_new_balance, dev_test_balance = v_dev_test_balance
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
          SELECT sam_api_enabled AND sam_wallet_mode = 'api'
            AND sam_shamcash_wallet_identifier IS NOT NULL
            AND length(trim(sam_shamcash_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;
        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API ShamCash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT shamcash_enabled
            AND shamcash_qr_image_url IS NOT NULL AND length(trim(shamcash_qr_image_url)) > 0
            AND shamcash_pay_code IS NOT NULL AND length(trim(shamcash_pay_code)) > 0
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
          SELECT sam_api_enabled AND sam_wallet_mode = 'api'
            AND sam_syriatel_wallet_identifier IS NOT NULL
            AND length(trim(sam_syriatel_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;
        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API Syriatel Cash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT syriatel_enabled
            AND syriatel_qr_image_url IS NOT NULL AND length(trim(syriatel_qr_image_url)) > 0
            AND syriatel_pay_code IS NOT NULL AND length(trim(syriatel_pay_code)) > 0
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

  INSERT INTO orders (
    user_id, total, payment_method, status, payment_reference, influencer_coupon_id
  ) VALUES (
    p_user_id, p_total, p_payment_method, v_order_status, v_reference,
    CASE WHEN v_partner_markup IS NULL THEN v_inf_coupon_id ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));
    INSERT INTO order_items (
      order_id, offer_id, name_snapshot, price, quantity,
      player_uid, player_server, player_charname
    ) VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      v_qty,
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, '')),
      NULLIF(v_item->>'player_charname', '')
    );
  END LOOP;

  IF v_idem IS NOT NULL THEN
    INSERT INTO public.purchase_idempotency (user_id, key, order_id)
    VALUES (p_user_id, v_idem, v_order_id)
    ON CONFLICT (user_id, key) DO NOTHING;
  END IF;

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
    BEGIN
      PERFORM public.pay_influencer_commission_for_order(v_order_id);
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
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

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text, text) TO authenticated;

-- 4. Fix check_fulfillment_invariants and ensure orders.updated_at exists
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.orders
  SET updated_at = created_at
  WHERE updated_at IS NULL;

CREATE OR REPLACE FUNCTION public.check_fulfillment_invariants()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_fulfilled_refunded jsonb;
  v_stuck jsonb;
  v_recent_failures jsonb;
BEGIN
  -- 1) Fulfilled orders that also have a refund transaction
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'orderId', o.id,
    'orderRef', o.order_ref,
    'total', o.total,
    'userName', COALESCE(p.username, p.name, 'Customer'),
    'refundedAt', t.created_at,
    'refundAmount', t.amount
  ) ORDER BY o.created_at DESC), '[]'::jsonb)
  INTO v_fulfilled_refunded
  FROM public.orders o
  JOIN public.transactions t
    ON t.user_id = o.user_id
    AND t.type = 'refund'
    AND t.reference LIKE 'FULFILL-REFUND-' || upper(left(replace(o.id::text, '-', ''), 8)) || '%'
    AND t.status = 'completed'
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.fulfillment_status = 'fulfilled';

  -- 2) Orders stuck on 'fulfilling' for more than 30 minutes
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'orderId', o.id,
    'orderRef', o.order_ref,
    'total', o.total,
    'userName', COALESCE(p.username, p.name, 'Customer'),
    'stuckSince', COALESCE(o.updated_at, o.created_at),
    'minutesStuck', EXTRACT(EPOCH FROM (now() - COALESCE(o.updated_at, o.created_at))) / 60
  ) ORDER BY COALESCE(o.updated_at, o.created_at) ASC), '[]'::jsonb)
  INTO v_stuck
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.fulfillment_status = 'fulfilling'
    AND COALESCE(o.updated_at, o.created_at) < now() - make_interval(mins => 30);

  -- 3) Fulfillment failures in the last 24 hours
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'orderId', o.id,
    'orderRef', o.order_ref,
    'total', o.total,
    'userName', COALESCE(p.username, p.name, 'Customer'),
    'failedAt', COALESCE((o.g2bulk_metadata->>'failed_at')::timestamptz, o.updated_at, o.created_at),
    'error', o.g2bulk_metadata->>'last_error'
  ) ORDER BY COALESCE((o.g2bulk_metadata->>'failed_at')::timestamptz, o.updated_at, o.created_at) DESC), '[]'::jsonb)
  INTO v_recent_failures
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.fulfillment_status = 'failed'
    AND COALESCE((o.g2bulk_metadata->>'failed_at')::timestamptz, o.updated_at, o.created_at) > now() - make_interval(hours => 24);

  RETURN jsonb_build_object(
    'fulfilledAndRefunded', v_fulfilled_refunded,
    'fulfilledAndRefundedCount', jsonb_array_length(v_fulfilled_refunded),
    'stuckFulfilling', v_stuck,
    'stuckFulfillingCount', jsonb_array_length(v_stuck),
    'recentFailures', v_recent_failures,
    'recentFailuresCount', jsonb_array_length(v_recent_failures),
    'checkedAt', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_fulfillment_invariants() FROM public;
GRANT EXECUTE ON FUNCTION public.check_fulfillment_invariants() TO service_role, authenticated;

-- 5. Fix negative-margin offers (Freefire Europe 11500 and 5600 Diamonds)
UPDATE public.offers
SET pricing_mode = 'auto', price = 109.62
WHERE id = 'a9a9c958-3b4f-4b74-ac52-c8aa9355a9c0';

UPDATE public.offers
SET pricing_mode = 'auto', price = 54.81
WHERE id = '03dc9551-5e9b-4d19-a91c-97757d1bf86a';

