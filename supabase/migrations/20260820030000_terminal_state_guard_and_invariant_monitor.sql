-- Terminal-state guard + invariant monitor + Telegram alert types + stale overload cleanup
-- Addresses: defense-in-depth for fulfillment regression, forward-looking monitor,
-- Telegram exception alerts, and stale save_g2bulk_settings overloads.

-- =============================================================================
-- 1. TERMINAL-STATE GUARD in apply_g2bulk_fulfillment
-- =============================================================================
-- Once an order is 'fulfilled', never regress to 'failed'. Late supplier retries,
-- cron retries, or manual admin RPCs must not undo a completed delivery.
-- Also: refuse refund when any item already has delivery evidence (codes delivered).

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
  v_auto_refund boolean := true;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Auto-refund toggle: OFF keeps failed orders as-is so an admin handles them
  -- manually (top up G2Bulk wallet + re-fulfill, or manual refund).
  SELECT COALESCE(g2bulk_auto_refund_on_fail, true) INTO v_auto_refund
  FROM public.store_settings WHERE id = 1;

  v_prev_status := v_order.fulfillment_status;

  -- ─── Terminal-state guard ────────────────────────────────────────────────
  -- Once fulfilled, never regress to failed. Late supplier retries, cron
  -- retries, or manual admin RPCs must not undo a completed delivery.
  -- The FOR UPDATE lock above serializes concurrent callers, so this
  -- holds even if the edge function's in-flight lock was bypassed.
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

  -- Only push item-level status on terminal states ('fulfilled'/'failed'/'skipped').
  -- While 'fulfilling', never downgrade already-delivered/skipped items.
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
    -- Secondary guard: refuse refund when any item already has delivery
    -- evidence (codes delivered). The ELSE branch unconditionally overwrites
    -- item fulfillment_status; we must not refund if product was delivered.
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
        -- Auto-refund disabled (admin setting): do NOT touch the balance.
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

-- =============================================================================
-- 2. INVARIANT MONITOR
-- =============================================================================
-- Forward-looking invariant check: "order is fulfilled and has a refund transaction"
-- should always return 0 rows. Also checks for stuck fulfilling and recent failures.
-- Call from pg_cron or edge function; today it should return 0 on the invariant check.

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
    'stuckSince', o.updated_at,
    'minutesStuck', EXTRACT(EPOCH FROM (now() - o.updated_at)) / 60
  ) ORDER BY o.updated_at ASC), '[]'::jsonb)
  INTO v_stuck
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.fulfillment_status = 'fulfilling'
    AND o.updated_at < now() - make_interval(mins => 30);

  -- 3) Fulfillment failures in the last 24 hours
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'orderId', o.id,
    'orderRef', o.order_ref,
    'total', o.total,
    'userName', COALESCE(p.username, p.name, 'Customer'),
    'failedAt', o.updated_at,
    'error', o.g2bulk_metadata->>'last_error'
  ) ORDER BY o.updated_at DESC), '[]'::jsonb)
  INTO v_recent_failures
  FROM public.orders o
  LEFT JOIN public.profiles p ON p.id = o.user_id
  WHERE o.fulfillment_status = 'failed'
    AND o.updated_at > now() - make_interval(hours => 24);

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

-- =============================================================================
-- 3. TELEGRAM ALERT TYPES — add invariantViolation, stuckFulfillment, recentFailures
-- =============================================================================

CREATE OR REPLACE FUNCTION public.telegram_alert_message(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_type
    WHEN 'orderPaid' THEN
        '<b>New order paid</b>' || E'\n'
      || 'Order: ' || public.telegram_escape(p_metadata->>'orderRef') || E'\n'
      || 'Amount: ' || public.telegram_escape(p_metadata->>'amount') || E'\n'
      || 'Payment: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'fulfillmentFail' THEN
        '<b>Order fulfillment FAILED</b>' || E'\n'
      || 'Order: ' || public.telegram_escape(p_metadata->>'orderRef') || E'\n'
      || 'Amount: ' || public.telegram_escape(p_metadata->>'amount') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName') || E'\n'
      || 'Error: ' || public.telegram_escape(p_metadata->>'error')
    WHEN 'recharge' THEN
        '<b>Recharge approved</b>' || E'\n'
      || 'Amount: ' || public.telegram_escape(p_metadata->>'amount') || E'\n'
      || 'Method: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Reference: ' || public.telegram_escape(p_metadata->>'reference') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'contact' THEN
        '<b>New contact message</b>' || E'\n'
      || 'From: ' || public.telegram_escape(p_metadata->>'name') || E'\n'
      || 'Email: ' || public.telegram_escape(p_metadata->>'email') || E'\n'
      || 'Message: ' || public.telegram_escape(p_metadata->>'message')
    WHEN 'review' THEN
        '<b>New customer review</b>' || E'\n'
      || 'Author: ' || public.telegram_escape(p_metadata->>'authorName') || E'\n'
      || 'Rating: ' || public.telegram_escape(p_metadata->>'rating') || '/5' || E'\n'
      || 'Message: ' || public.telegram_escape(p_metadata->>'message')
    WHEN 'signup' THEN
        '<b>New customer signup</b>' || E'\n'
      || 'Name: ' || public.telegram_escape(p_metadata->>'name') || E'\n'
      || 'Username: ' || public.telegram_escape(p_metadata->>'username') || E'\n'
      || 'Email: ' || public.telegram_escape(p_metadata->>'email')
    WHEN 'lowWallet' THEN
        '<b>G2Bulk wallet is low</b>' || E'\n'
      || 'Top up the supplier wallet so fulfillment can continue.' || E'\n'
      || 'Order: ' || public.telegram_escape(p_metadata->>'orderRef') || E'\n'
      || 'Detail: ' || public.telegram_escape(p_metadata->>'detail')
    WHEN 'invariantViolation' THEN
        '<b>⚠️ Invariant violation</b>' || E'\n'
      || 'Fulfilled order has a refund transaction.' || E'\n'
      || 'Count: ' || public.telegram_escape(p_metadata->>'count') || E'\n'
      || 'Detail: ' || public.telegram_escape(p_metadata->>'detail')
    WHEN 'stuckFulfillment' THEN
        '<b>⏳ Orders stuck fulfilling</b>' || E'\n'
      || public.telegram_escape(p_metadata->>'count') || ' order(s) stuck >30 min.' || E'\n'
      || 'Oldest: ' || public.telegram_escape(p_metadata->>'oldestRef') || E'\n'
      || 'Detail: ' || public.telegram_escape(p_metadata->>'detail')
    WHEN 'recentFailures' THEN
        '<b>❌ Recent fulfillment failures</b>' || E'\n'
      || public.telegram_escape(p_metadata->>'count') || ' failure(s) in the last 24h.' || E'\n'
      || 'Detail: ' || public.telegram_escape(p_metadata->>'detail')
    WHEN 'test' THEN
        '<b>ECHOCORE Telegram alerts — test message</b>' || E'\n'
      || 'If you can read this, alerts are working.'
    ELSE
      NULL
  END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_alert_link(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_type
    WHEN 'orderPaid' THEN
      'https://www.echocore412.com/dashboard/orders?order=' || public.telegram_escape(p_metadata->>'orderId')
    WHEN 'fulfillmentFail' THEN
      'https://www.echocore412.com/dashboard/orders?order=' || public.telegram_escape(p_metadata->>'orderId')
    WHEN 'recharge' THEN
      'https://www.echocore412.com/dashboard/recharges'
    WHEN 'contact' THEN
      'https://www.echocore412.com/dashboard/contact'
    WHEN 'review' THEN
      'https://www.echocore412.com/dashboard/reviews'
    WHEN 'signup' THEN
      'https://www.echocore412.com/dashboard/users/' || public.telegram_escape(p_metadata->>'username')
    WHEN 'lowWallet' THEN
      'https://www.echocore412.com/dashboard/apis/g2bulk'
    WHEN 'invariantViolation' THEN
      'https://www.echocore412.com/dashboard/orders'
    WHEN 'stuckFulfillment' THEN
      'https://www.echocore412.com/dashboard/orders?status=fulfilling'
    WHEN 'recentFailures' THEN
      'https://www.echocore412.com/dashboard/orders?status=failed'
    ELSE
      NULL
  END;
$$;

-- =============================================================================
-- 4. DROP STALE save_g2bulk_settings OVERLOADS
-- =============================================================================
-- PostgREST resolves RPC overloads by argument names; old signatures can bind
-- silently and fall back to defaults. Drop them by exact signature.

DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text);
