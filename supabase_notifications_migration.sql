-- =============================================================================
-- ECHOCORE — IN-APP NOTIFICATIONS
-- Run in Supabase SQL Editor after prior migrations.
-- Then enable Realtime for `notifications` in Dashboard → Database → Replication.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. NOTIFICATIONS TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Inserts/updates only via SECURITY DEFINER helpers below

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 2. INTERNAL HELPERS
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

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;


CREATE OR REPLACE FUNCTION public.notify_all_admins(
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin record;
  v_count int := 0;
BEGIN
  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin'
  LOOP
    PERFORM public.notify_user(v_admin.id, p_type, p_metadata, p_link);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_all_admins(text, jsonb, text) FROM public;

-- ---------------------------------------------------------------------------
-- 3. CLIENT RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT id, type, metadata, link, read_at, created_at
      FROM public.notifications
      WHERE user_id = v_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100))
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notifications(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.notifications
  WHERE user_id = v_user_id AND read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count() FROM public;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.notifications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
    SET read_at = now()
    WHERE id = p_notification_id AND user_id = v_user_id AND read_at IS NULL
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.notifications
    WHERE id = p_notification_id AND user_id = v_user_id;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'readAt', v_row.read_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
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

  UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = v_user_id AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. HOOK EXISTING FLOWS — emit notifications
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

  SELECT name INTO v_user_name FROM profiles WHERE id = v_row.user_id;

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
    'status', 'payment_sent'
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.mark_order_payment_sent(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_user_name text;
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

  SELECT name INTO v_user_name FROM profiles WHERE id = v_order.user_id;

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
    'status', 'payment_sent'
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.approve_recharge_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_new_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting approval';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_row.user_id,
    v_row.amount,
    v_row.payment_method,
    v_row.reference
  );

  UPDATE recharge_requests
    SET status = 'approved',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.reject_recharge_request(p_request_id uuid, p_note text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting review';
  END IF;

  UPDATE recharge_requests
    SET status = 'rejected',
        admin_note = nullif(trim(p_note), ''),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_rejected',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'note', nullif(trim(p_note), '')
    ),
    '/recharge'
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'status', 'rejected'
  );
END;
$$;


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

  PERFORM public.notify_user(
    v_order.user_id,
    'order_rejected',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'note', nullif(trim(p_note), '')
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'cancelled',
    'note', nullif(trim(p_note), '')
  );
END;
$$;


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
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 5. CONTACT FORM — notify admins on new message
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_contact_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all_admins(
    'admin_contact_message',
    jsonb_build_object(
      'messageId', NEW.id,
      'name', NEW.name,
      'email', NEW.email
    ),
    '/dashboard'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_message_notify_admins ON public.contact_messages;
CREATE TRIGGER contact_message_notify_admins
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_contact_message_insert();