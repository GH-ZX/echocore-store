-- =============================================================================
-- ECHOCORE — NOTIFICATIONS V2
-- Run in Supabase SQL Editor after supabase_notifications_migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CLEAR NOTIFICATIONS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.notifications
  WHERE user_id = v_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_all_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_all_notifications() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. USER NOTIFICATION WHEN RECHARGE SENT TO ADMIN QUEUE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'This recharge request can no longer be updated';
  END IF;

  UPDATE recharge_requests
    SET status = 'payment_sent', updated_at = now()
    WHERE id = p_request_id;

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'currentBalance', v_current_balance
    ),
    '/recharge'
  );

  PERFORM public.notify_all_admins(
    'admin_recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'userName', COALESCE(v_user_name, 'Customer')
    ),
    '/dashboard'
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. USER NOTIFICATION WHEN ORDER PAYMENT SENT TO ADMIN QUEUE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_order_payment_sent(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
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

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'reference', v_order.payment_reference,
      'currentBalance', v_current_balance
    ),
    '/profile'
  );

  PERFORM public.notify_all_admins(
    'admin_order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'reference', v_order.payment_reference,
      'userName', COALESCE(v_user_name, 'Customer')
    ),
    '/dashboard'
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'reference', v_order.payment_reference,
    'total', v_order.total,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. NOTIFY USER WHEN G2BULK FULFILLMENT COMPLETES
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
  v_has_codes boolean := false;
  v_has_uid boolean := false;
  v_notif_type text;
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

  IF p_fulfillment_status = 'fulfilled' AND v_order.user_id IS NOT NULL THEN
    v_has_codes := (
      p_delivery_items IS NOT NULL
      AND jsonb_typeof(p_delivery_items) = 'array'
      AND jsonb_array_length(p_delivery_items) > 0
    );

    SELECT EXISTS (
      SELECT 1 FROM public.order_items
      WHERE order_id = p_order_id AND player_uid IS NOT NULL AND length(trim(player_uid)) > 0
    ) INTO v_has_uid;

    v_notif_type := CASE
      WHEN v_has_codes THEN 'delivery_ready'
      WHEN v_has_uid THEN 'topup_delivered'
      ELSE 'order_fulfilled'
    END;

    PERFORM public.notify_user(
      v_order.user_id,
      v_notif_type,
      jsonb_build_object(
        'orderId', p_order_id,
        'total', v_order.total,
        'hasCodes', v_has_codes,
        'hasUid', v_has_uid
      ),
      '/success?orderId=' || p_order_id::text
    );
  END IF;

  IF p_fulfillment_status = 'failed' AND v_order.user_id IS NOT NULL THEN
    PERFORM public.notify_user(
      v_order.user_id,
      'fulfillment_failed',
      jsonb_build_object(
        'orderId', p_order_id,
        'total', v_order.total,
        'error', left(COALESCE(p_error, 'Fulfillment failed'), 200)
      ),
      '/success?orderId=' || p_order_id::text
    );
  END IF;

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


-- ---------------------------------------------------------------------------
-- 5. ADMIN DEV TOOLS (testing without real G2Bulk / payments)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_credit_test_balance(p_amount numeric DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_new_balance numeric;
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

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'amount', v_amount,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_credit_test_balance(numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_credit_test_balance(numeric) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_mock_fulfill_order(p_order_id uuid, p_mock_code text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_has_uid boolean := false;
  v_codes jsonb;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Order must be completed before mock fulfillment';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id AND player_uid IS NOT NULL AND length(trim(player_uid)) > 0
  ) INTO v_has_uid;

  IF v_has_uid THEN
    v_codes := NULL;
  ELSE
    v_code := COALESCE(
      nullif(trim(p_mock_code), ''),
      'TEST-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 12))
    );
    v_codes := jsonb_build_array(v_code);
  END IF;

  RETURN public.apply_g2bulk_fulfillment(
    p_order_id,
    'fulfilled',
    'MOCK-DEV',
    v_codes,
    jsonb_build_object('mock', true, 'mocked_at', now()),
    NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_mock_fulfill_order(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_mock_fulfill_order(uuid, text) TO authenticated;