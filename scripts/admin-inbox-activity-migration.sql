-- Admin inbox: notify on purchases / fulfillment / recharges, raise retention, fix limits.
-- Run: supabase db query --linked -f scripts/admin-inbox-activity-migration.sql

-- =============================================================================
-- 1) Retention + fetch limits
-- =============================================================================

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

  -- Drop read notifications older than 90 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND read_at IS NOT NULL
    AND read_at < now() - interval '90 days';

  -- Drop any notification older than 120 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND created_at < now() - interval '120 days';

  -- Keep latest 250 per user (admins get more activity)
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND id IN (
      SELECT id
      FROM public.notifications
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      OFFSET 250
    );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;

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
      SELECT id, type, metadata, link, read_at, bell_hidden_at, created_at
      FROM public.notifications
      WHERE user_id = v_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 500))
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notifications(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;

-- =============================================================================
-- 2) Helper: safe site log (no-op if append_site_log missing)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.try_append_site_log(
  p_category text,
  p_event_type text,
  p_severity text,
  p_subject_user_id uuid,
  p_actor_user_id uuid,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.append_site_log(
    p_category,
    p_event_type,
    p_severity,
    p_subject_user_id,
    p_actor_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  );
EXCEPTION
  WHEN undefined_function THEN
    NULL;
  WHEN OTHERS THEN
    NULL;
END;
$$;

-- =============================================================================
-- 3) Order completed → notify all admins (+ site log)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_order_completed_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_link text;
  v_event text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_link := '/invoice/order/' || NEW.id::text;
  v_event := CASE
    WHEN NEW.payment_method = 'balance' THEN 'balance_paid'
    WHEN NEW.payment_method IN ('ShamCash', 'SyriatelCash') THEN 'sam_paid'
    ELSE 'completed'
  END;

  PERFORM public.notify_all_admins(
    'admin_purchase_completed',
    jsonb_build_object(
      'orderId', NEW.id,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'order',
    v_event,
    'success',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'orderId', NEW.id,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_completed_notify_admins ON public.orders;
CREATE TRIGGER order_completed_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_completed_notify_admins();

-- =============================================================================
-- 4) Fulfillment status → notify admins (+ keep customer path as-is in apply_*)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_order_fulfillment_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_link text;
  v_type text;
  v_has_uid boolean := false;
  v_has_codes boolean := false;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.fulfillment_status IS NOT DISTINCT FROM OLD.fulfillment_status THEN
    RETURN NEW;
  END IF;

  IF NEW.fulfillment_status NOT IN ('fulfilled', 'failed') THEN
    RETURN NEW;
  END IF;

  -- Only fire on transition into these states
  IF TG_OP = 'UPDATE'
    AND OLD.fulfillment_status IS NOT DISTINCT FROM NEW.fulfillment_status
  THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND OLD.fulfillment_status = NEW.fulfillment_status
  THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_link := '/invoice/order/' || NEW.id::text;

  IF NEW.fulfillment_status = 'failed' THEN
    PERFORM public.notify_all_admins(
      'admin_fulfillment_failed',
      jsonb_build_object(
        'orderId', NEW.id,
        'total', NEW.total,
        'amount', NEW.total,
        'userName', COALESCE(v_user_name, 'Customer'),
        'userId', NEW.user_id,
        'error', COALESCE(NEW.g2bulk_metadata->>'last_error', 'fulfillment failed')
      ),
      v_link
    );
    PERFORM public.try_append_site_log(
      'order',
      'fulfillment_failed',
      'error',
      NEW.user_id,
      NULL,
      jsonb_build_object(
        'orderId', NEW.id,
        'total', NEW.total,
        'amount', NEW.total,
        'userName', COALESCE(v_user_name, 'Customer'),
        'error', COALESCE(NEW.g2bulk_metadata->>'last_error', '')
      )
    );
    RETURN NEW;
  END IF;

  -- fulfilled
  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = NEW.id
      AND player_uid IS NOT NULL
      AND length(trim(player_uid)) > 0
  ) INTO v_has_uid;

  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = NEW.id
      AND delivery_items IS NOT NULL
      AND jsonb_typeof(delivery_items) = 'array'
      AND jsonb_array_length(delivery_items) > 0
  ) INTO v_has_codes;

  v_type := CASE
    WHEN v_has_codes THEN 'admin_delivery_ready'
    WHEN v_has_uid THEN 'admin_topup_delivered'
    ELSE 'admin_order_fulfilled'
  END;

  PERFORM public.notify_all_admins(
    v_type,
    jsonb_build_object(
      'orderId', NEW.id,
      'total', NEW.total,
      'amount', NEW.total,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id,
      'hasCodes', v_has_codes,
      'hasUid', v_has_uid
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'order',
    'fulfilled',
    'success',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'orderId', NEW.id,
      'total', NEW.total,
      'amount', NEW.total,
      'userName', COALESCE(v_user_name, 'Customer'),
      'kind', v_type
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_fulfillment_notify_admins ON public.orders;
CREATE TRIGGER order_fulfillment_notify_admins
  AFTER UPDATE OF fulfillment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_fulfillment_notify_admins();

-- =============================================================================
-- 5) Recharge approved → notify admins (manual + Sam API)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_recharge_approved_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_amount numeric;
  v_link text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'approved' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  v_amount := COALESCE(NEW.credited_amount, NEW.amount);
  v_link := '/invoice/recharge/' || NEW.id::text;

  PERFORM public.notify_all_admins(
    'admin_recharge_completed',
    jsonb_build_object(
      'requestId', NEW.id,
      'amount', v_amount,
      'reference', NEW.reference,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'recharge',
    'completed',
    'success',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'requestId', NEW.id,
      'amount', v_amount,
      'reference', NEW.reference,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS recharge_approved_notify_admins ON public.recharge_requests;
CREATE TRIGGER recharge_approved_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.recharge_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.on_recharge_approved_notify_admins();

-- =============================================================================
-- 6) Contact notify: correct link + message preview + site log
-- =============================================================================

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
      'email', NEW.email,
      'message', left(coalesce(NEW.message, ''), 200)
    ),
    '/dashboard/contact'
  );

  PERFORM public.try_append_site_log(
    'contact',
    'message_received',
    'info',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'messageId', NEW.id,
      'name', NEW.name,
      'email', NEW.email
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_message_notify_admins ON public.contact_messages;
CREATE TRIGGER contact_message_notify_admins
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_contact_message_insert();

-- =============================================================================
-- 7) Manual payment-sent links → invoice / recharges
-- =============================================================================

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
      'amount', v_order.total,
      'reference', v_order.payment_reference,
      'currentBalance', v_current_balance
    ),
    '/invoice/order/' || p_order_id::text
  );

  PERFORM public.notify_all_admins(
    'admin_order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'amount', v_order.total,
      'reference', v_order.payment_reference,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', v_order.user_id
    ),
    '/invoice/order/' || p_order_id::text
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

-- Customer fulfillment links → invoice (preserves balance refund guard from stock-guard migration)
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
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_prev_status := v_order.fulfillment_status;
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
    IF v_order.payment_method = 'balance'
       AND COALESCE((v_order.g2bulk_metadata->>'balance_refunded')::boolean, false) = false
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

COMMENT ON FUNCTION public.on_order_completed_notify_admins() IS
  'Notifies all admins when any order becomes completed (balance / Sam / manual).';
COMMENT ON FUNCTION public.on_order_fulfillment_notify_admins() IS
  'Notifies all admins on fulfillment success/failure.';
COMMENT ON FUNCTION public.on_recharge_approved_notify_admins() IS
  'Notifies all admins when a recharge is approved (manual or Sam API).';
