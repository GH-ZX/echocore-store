-- =============================================================================
-- Disable manual ShamCash/Syriatel order approval when Sam API wallet mode is on.
-- Run in Supabase SQL Editor after enabling sam_wallet_mode = 'api'.
-- =============================================================================

-- 1. Users cannot mark order payment sent manually in API mode (same as recharge).
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
  v_wallet_mode text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode = 'api' THEN
    RAISE EXCEPTION 'Manual payment confirmation is not used in Sam API wallet mode';
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

-- 2. Admins cannot manually confirm wallet orders in API mode — Sam webhook only.
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
  v_wallet_mode text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_wallet_mode = 'api'
    AND v_order.payment_method IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Manual order approval is not used in Sam API wallet mode';
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

  PERFORM public.notify_user(
    v_order.user_id,
    'order_completed',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total
    ),
    '/success?orderId=' || p_order_id::text
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'completed'
  );
END;
$$;