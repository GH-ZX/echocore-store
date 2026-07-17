-- =============================================================================
-- CRITICAL: Never auto-refund balance when fulfillment "fails" due to poll timeout.
-- G2Bulk often completes AFTER our poll window → refund + user retry = FREE multi-topup.
-- Soft errors → keep/fulfill as "fulfilling" (retryable). Terminal supplier fails only refund.
-- Apply: supabase db query --linked -f scripts/no-refund-on-soft-timeout.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_soft_fulfillment_error(p_error text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT p_error IS NOT NULL AND (
    p_error ILIKE '%timed out%'
    OR p_error ILIKE '%timeout%'
    OR p_error ILIKE '%still processing%'
    OR p_error ILIKE '%aborted%'
    OR p_error ILIKE '%abort%'
    OR p_error ILIKE '%deadline%'
    OR p_error ILIKE '%network%'
    OR p_error ILIKE '%ECONNRESET%'
    OR p_error ILIKE '%fetch failed%'
  );
$$;

CREATE OR REPLACE FUNCTION public.apply_g2bulk_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_g2bulk_order_id text DEFAULT NULL,
  p_delivery_items jsonb DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT NULL
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
  v_status text := p_fulfillment_status;
  v_soft boolean := public.is_soft_fulfillment_error(p_error);
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  -- Soft timeout while supplier may still complete → never mark failed / never refund
  IF v_status = 'failed' AND v_soft THEN
    v_status := 'fulfilling';
    v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb)
      || COALESCE(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'soft_timeout', true,
        'soft_timeout_at', now(),
        'soft_timeout_error', p_error,
        'awaiting_supplier', true
      );
  ELSE
    v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb);
    IF p_error IS NOT NULL AND v_status = 'failed' THEN
      v_meta := v_meta || jsonb_build_object('last_error', p_error, 'failed_at', now());
    ELSIF p_error IS NOT NULL AND v_status = 'fulfilling' THEN
      v_meta := v_meta || jsonb_build_object('last_poll_note', p_error, 'last_poll_at', now());
    END IF;
  END IF;

  v_prev_status := v_order.fulfillment_status;

  UPDATE public.orders
  SET
    fulfillment_status = v_status,
    g2bulk_order_id = COALESCE(p_g2bulk_order_id, g2bulk_order_id),
    g2bulk_metadata = v_meta
  WHERE id = p_order_id;

  IF p_delivery_items IS NOT NULL THEN
    UPDATE public.order_items
    SET
      delivery_items = p_delivery_items,
      fulfillment_status = CASE
        WHEN v_status = 'fulfilled' THEN 'fulfilled'
        WHEN v_status = 'failed' THEN 'failed'
        ELSE fulfillment_status
      END
    WHERE order_id = p_order_id;
  END IF;

  v_link := '/invoice/order/' || p_order_id::text;

  IF v_status = 'fulfilled'
    AND v_prev_status IS DISTINCT FROM 'fulfilled'
    AND v_order.user_id IS NOT NULL
  THEN
    SELECT EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id
        AND player_uid IS NOT NULL
        AND length(trim(player_uid)) > 0
    ) INTO v_has_uid;

    BEGIN
      SELECT COALESCE(jsonb_agg(to_jsonb(di) ORDER BY oi.created_at), '[]'::jsonb)
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
    EXCEPTION WHEN OTHERS THEN
      v_has_codes := false;
    END;

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

  ELSIF v_status = 'failed'
    AND v_prev_status IS DISTINCT FROM 'failed'
    AND v_order.user_id IS NOT NULL
  THEN
    -- HARD fail only (stock, supplier reject, refunded). Soft timeouts never reach here.
    IF v_order.payment_method = 'balance'
       AND COALESCE((v_meta->>'balance_refunded')::boolean, false) = false
       AND NOT public.is_soft_fulfillment_error(COALESCE(p_error, v_meta->>'last_error'))
    THEN
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
    'fulfillmentStatus', v_status,
    'g2bulkOrderId', p_g2bulk_order_id,
    'deliveryItems', p_delivery_items,
    'balanceRefunded', v_refunded,
    'newBalance', v_new_balance,
    'softTimeoutDowngraded', v_soft AND p_fulfillment_status = 'failed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;

-- Block double-buy while a same-player+offer order is still open (paid, not terminal)
CREATE OR REPLACE FUNCTION public.has_open_duplicate_topup(
  p_user_id uuid,
  p_offer_id uuid,
  p_player_uid text,
  p_within_minutes int DEFAULT 20
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := nullif(trim(COALESCE(p_player_uid, '')), '');
  v_found boolean := false;
BEGIN
  IF p_user_id IS NULL OR p_offer_id IS NULL OR v_uid IS NULL THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    WHERE o.user_id = p_user_id
      AND o.status = 'completed'
      AND o.fulfillment_status IN ('pending', 'fulfilling')
      AND o.created_at > now() - make_interval(mins => GREATEST(5, LEAST(COALESCE(p_within_minutes, 20), 120)))
      AND oi.offer_id = p_offer_id
      AND nullif(trim(COALESCE(oi.player_uid, '')), '') = v_uid
  ) INTO v_found;

  RETURN COALESCE(v_found, false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.has_open_duplicate_topup(uuid, uuid, text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.has_open_duplicate_topup(uuid, uuid, text, int) TO authenticated;
