-- Telegram hardening + richer notifications
--  1. Single-use link tokens (replaces trusting a chat_id from the URL / forged JWT)
--  2. Service-role-only approve/reject recharge (atomic, same path as the dashboard)
--  3. Alerts show product names and never leak error text
--  4. Customer DMs: escaped, no errors, product names, independent of admin-alert toggle
--  5. orderPaid alert fires at commit (deferred) so order_items exist

-- =============================================================================
-- 1. Link tokens
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token text PRIMARY KEY,
  chat_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  used_at timestamptz
);

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_link_tokens FROM public, anon, authenticated;
GRANT ALL ON public.telegram_link_tokens TO service_role;

CREATE INDEX IF NOT EXISTS telegram_link_tokens_expires_idx
  ON public.telegram_link_tokens (expires_at);

-- Atomically consume a token and link its chat to the given user.
-- Only the edge function (service_role) can call this, after verifying the caller's JWT.
CREATE OR REPLACE FUNCTION public.consume_telegram_link_token(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_chat_id text;
BEGIN
  UPDATE public.telegram_link_tokens
  SET used_at = now()
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING chat_id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE telegram_chat_id = v_chat_id AND id <> p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chat_taken');
  END IF;

  UPDATE public.profiles
  SET telegram_chat_id = v_chat_id,
      telegram_linked_at = now()
  WHERE id = p_user_id;

  DELETE FROM public.telegram_link_tokens WHERE expires_at < now() - interval '1 day';

  RETURN jsonb_build_object('ok', true, 'chat_id', v_chat_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_telegram_link_token(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_telegram_link_token(text, uuid) TO service_role;

-- The legacy RPC relied on a session GUC nobody sets; it only invites misuse.
DROP FUNCTION IF EXISTS public.link_telegram_account(text);

-- =============================================================================
-- 2. Bot approve / reject (service_role only; row-locked, mirrors dashboard RPCs)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.telegram_approve_recharge(p_request_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row recharge_requests%ROWTYPE;
  v_new_balance numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM recharge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge request not found'; END IF;
  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting approval';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_row.user_id, v_row.amount, v_row.payment_method, v_row.reference
  );

  UPDATE recharge_requests
    SET status = 'approved', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_request_id;

  PERFORM public.notify_user(
    v_row.user_id, 'recharge_approved',
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount, 'newBalance', v_new_balance),
    '/profile'
  );

  PERFORM public.append_site_log(
    'recharge', 'approved', 'success', p_admin_id, v_row.user_id,
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount,
                       'newBalance', v_new_balance, 'via', 'telegram')
  );

  RETURN jsonb_build_object('userId', v_row.user_id, 'amount', v_row.amount, 'newBalance', v_new_balance);
END;
$$;

CREATE OR REPLACE FUNCTION public.telegram_reject_recharge(p_request_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM recharge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge request not found'; END IF;
  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting review';
  END IF;

  UPDATE recharge_requests
    SET status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_request_id;

  PERFORM public.notify_user(
    v_row.user_id, 'recharge_rejected',
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount),
    '/recharge'
  );

  PERFORM public.append_site_log(
    'recharge', 'rejected', 'danger', p_admin_id, v_row.user_id,
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount, 'via', 'telegram')
  );

  RETURN jsonb_build_object('userId', v_row.user_id, 'amount', v_row.amount);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_approve_recharge(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.telegram_reject_recharge(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_approve_recharge(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_reject_recharge(uuid, uuid) TO service_role;

-- =============================================================================
-- 3. Product names in alerts, no error text
-- =============================================================================
-- "• 2× Name" lines (HTML-escaped), capped so the message stays well under limits.
CREATE OR REPLACE FUNCTION public.telegram_order_items_text(p_order_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(string_agg(
           '• ' || oi.quantity::text || '× ' || public.telegram_escape(left(COALESCE(oi.name_snapshot, '—'), 80)),
           E'\n' ORDER BY oi.id
         ), '')
  FROM (
    SELECT id, quantity, name_snapshot
    FROM public.order_items
    WHERE order_id = p_order_id
    ORDER BY id
    LIMIT 8
  ) oi;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_order_items_text(uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_order_items_text(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.telegram_alert_message(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE p_type
    WHEN 'orderPaid' THEN
        '🟢 <b>New order paid</b>' || E'\n'
      || 'Order: <code>' || public.telegram_escape(p_metadata->>'orderRef') || '</code>' || E'\n'
      || COALESCE(nullif(p_metadata->>'items', '') || E'\n', '')
      || 'Amount: <b>$' || public.telegram_escape(p_metadata->>'amount') || '</b>' || E'\n'
      || 'Payment: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'fulfillmentFail' THEN
        '🔴 <b>Order fulfillment failed</b>' || E'\n'
      || 'Order: <code>' || public.telegram_escape(p_metadata->>'orderRef') || '</code>' || E'\n'
      || COALESCE(nullif(p_metadata->>'items', '') || E'\n', '')
      || 'Amount: <b>$' || public.telegram_escape(p_metadata->>'amount') || '</b>' || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'recharge' THEN
        '🟢 <b>Recharge approved</b>' || E'\n'
      || 'Amount: <b>$' || public.telegram_escape(p_metadata->>'amount') || '</b>' || E'\n'
      || 'Method: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Reference: <code>' || public.telegram_escape(p_metadata->>'reference') || '</code>' || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'contact' THEN
        '✉️ <b>New contact message</b>' || E'\n'
      || 'From: ' || public.telegram_escape(p_metadata->>'name') || E'\n'
      || 'Email: ' || public.telegram_escape(p_metadata->>'email') || E'\n'
      || 'Message: ' || public.telegram_escape(left(COALESCE(p_metadata->>'message', ''), 300))
    WHEN 'review' THEN
        '⭐ <b>New customer review</b>' || E'\n'
      || 'Author: ' || public.telegram_escape(p_metadata->>'authorName') || E'\n'
      || 'Rating: ' || public.telegram_escape(p_metadata->>'rating') || '/5' || E'\n'
      || 'Message: ' || public.telegram_escape(left(COALESCE(p_metadata->>'message', ''), 300))
    WHEN 'signup' THEN
        '👤 <b>New customer signup</b>' || E'\n'
      || 'Name: ' || public.telegram_escape(p_metadata->>'name') || E'\n'
      || 'Username: ' || public.telegram_escape(p_metadata->>'username') || E'\n'
      || 'Email: ' || public.telegram_escape(p_metadata->>'email')
    WHEN 'lowWallet' THEN
        '🟡 <b>G2Bulk wallet is low</b>' || E'\n'
      || 'Top up the supplier wallet so fulfillment can continue.' || E'\n'
      || 'Order: <code>' || public.telegram_escape(p_metadata->>'orderRef') || '</code>'
    WHEN 'invariantViolation' THEN
        '🔴 <b>Invariant violation</b>' || E'\n'
      || 'Fulfilled order has a refund transaction.' || E'\n'
      || 'Count: <b>' || public.telegram_escape(p_metadata->>'count') || '</b>'
    WHEN 'stuckFulfillment' THEN
        '🟡 <b>Orders stuck fulfilling</b>' || E'\n'
      || '<b>' || public.telegram_escape(p_metadata->>'count') || '</b> order(s) stuck over 30 min.' || E'\n'
      || 'Oldest: <code>' || public.telegram_escape(p_metadata->>'oldestRef') || '</code>'
    WHEN 'recentFailures' THEN
        '🔴 <b>Recent fulfillment failures</b>' || E'\n'
      || '<b>' || public.telegram_escape(p_metadata->>'count') || '</b> failure(s) in the last 24h.'
    WHEN 'test' THEN
        '✅ <b>ECHOCORE Telegram alerts — test message</b>' || E'\n'
      || 'If you can read this, alerts are working.'
    ELSE
      NULL
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_alert_message(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.telegram_alert_message(text, jsonb) TO authenticated, service_role;

-- Admin alerts: inject product names, send the "Open" link as an inline button.
CREATE OR REPLACE FUNCTION public.notify_admin_telegram(
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_chat text;
  v_token text;
  v_text text;
  v_link text;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_order_id uuid;
  v_body jsonb;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  IF NOT COALESCE(v_row.telegram_alerts_enabled, false) THEN
    RETURN;
  END IF;

  v_token := nullif(trim(COALESCE(v_row.telegram_bot_token, '')), '');
  v_chat := nullif(trim(COALESCE(v_row.telegram_chat_id, '')), '');
  IF v_token IS NULL OR v_chat IS NULL THEN
    RETURN;
  END IF;

  IF COALESCE((v_row.telegram_alert_prefs->>p_type)::boolean, true) = false THEN
    RETURN;
  END IF;

  IF p_type IN ('orderPaid', 'fulfillmentFail') AND (v_meta->>'orderId') ~* '^[0-9a-f-]{36}$' THEN
    v_order_id := (v_meta->>'orderId')::uuid;
    v_meta := v_meta || jsonb_build_object('items', public.telegram_order_items_text(v_order_id));
  END IF;

  v_text := public.telegram_alert_message(p_type, v_meta);
  IF v_text IS NULL OR v_text = '' THEN
    RETURN;
  END IF;

  v_link := public.telegram_alert_link(p_type, v_meta);

  BEGIN
    v_body := jsonb_build_object(
      'chat_id', v_chat,
      'text', left(v_text, 3500),
      'parse_mode', 'HTML',
      'disable_web_page_preview', true
    );
    IF v_link IS NOT NULL THEN
      v_body := v_body || jsonb_build_object(
        'reply_markup', jsonb_build_object(
          'inline_keyboard', jsonb_build_array(jsonb_build_array(
            jsonb_build_object('text', '🔎 Open in dashboard', 'url', v_link)
          ))
        )
      );
    END IF;

    PERFORM net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := v_body,
      timeout_milliseconds := 30000
    );
    PERFORM public.try_append_site_log(
      'telegram', p_type, 'info', NULL, NULL,
      jsonb_build_object('length', length(v_text))
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$$;

-- =============================================================================
-- 4. Customer DMs: escaped, product names, no errors, no admin-toggle coupling
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_linked_user_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_chat_id text;
  v_token text;
  v_text text;
  v_order_ref text;
  v_items text;
  v_buttons jsonb;
  v_refunded boolean;
BEGIN
  IF OLD.fulfillment_status IS NOT DISTINCT FROM NEW.fulfillment_status THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.fulfillment_status NOT IN ('fulfilled', 'failed') THEN
    RETURN NEW;
  END IF;

  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id AND telegram_chat_id IS NOT NULL AND telegram_chat_id <> '';
  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Customer DMs only need a configured bot; they are independent of the admin-alert switch.
  SELECT nullif(trim(telegram_bot_token), '') INTO v_token
  FROM public.store_settings WHERE id = 1;
  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  v_order_ref := COALESCE(NEW.order_ref, LEFT(NEW.id::text, 8));
  v_items := public.telegram_order_items_text(NEW.id);
  v_refunded := COALESCE((NEW.g2bulk_metadata->>'balance_refunded')::boolean, false);

  IF NEW.fulfillment_status = 'fulfilled' THEN
    v_text := '🎉 <b>Order delivered!</b>' || E'\n'
      || 'Order: <code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || 'Amount: <b>$' || NEW.total::text || '</b>';
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', '📄 View invoice', 'url', 'https://www.echocore412.com/invoice/order/' || NEW.id::text)),
      jsonb_build_array(jsonb_build_object('text', '📦 My orders', 'callback_data', 'my_orders'))
    );
  ELSE
    v_text := '❌ <b>We could not complete your order</b>' || E'\n'
      || 'Order: <code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || 'Amount: <b>$' || NEW.total::text || '</b>';
    IF v_refunded THEN
      v_text := v_text || E'\n\n💰 Your balance has been refunded.';
    ELSE
      v_text := v_text || E'\n\nOur team is looking into it.';
    END IF;
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', '💬 Contact support', 'url', 'https://www.echocore412.com/contact'))
    );
    IF v_refunded THEN
      v_buttons := jsonb_build_array(
        jsonb_build_array(jsonb_build_object('text', '🛒 Browse store', 'url', 'https://www.echocore412.com'))
      ) || v_buttons;
    END IF;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'chat_id', v_chat_id,
        'text', left(v_text, 3500),
        'parse_mode', 'HTML',
        'disable_web_page_preview', true,
        'reply_markup', jsonb_build_object('inline_keyboard', v_buttons)
      ),
      timeout_milliseconds := 10000
    );
    PERFORM public.try_append_site_log(
      'telegram', 'customer_fulfillment_' || NEW.fulfillment_status, 'info',
      NEW.user_id, NULL,
      jsonb_build_object('orderId', NEW.id, 'orderRef', v_order_ref)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Never block the order update
  END;

  RETURN NEW;
END;
$$;

-- =============================================================================
-- 5. orderPaid alert at commit, so order_items rows exist
-- =============================================================================
-- Remove the (too early) Telegram call from the existing paid-order trigger.
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

  v_link := '/dashboard/orders?order=' || NEW.id::text;
  v_event := CASE
    WHEN NEW.payment_method = 'balance' THEN 'balance_paid'
    WHEN NEW.payment_method IN ('ShamCash', 'SyriatelCash') THEN 'sam_paid'
    ELSE 'completed'
  END;

  PERFORM public.notify_all_admins(
    'admin_purchase_completed',
    jsonb_build_object(
      'orderId', NEW.id,
      'orderRef', NEW.order_ref,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id,
      'phase', 'payment'
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'order', v_event, 'info', NEW.user_id, NULL,
    jsonb_build_object(
      'orderId', NEW.id,
      'orderRef', NEW.order_ref,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_order_paid_telegram_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_row public.orders%ROWTYPE;
BEGIN
  -- Re-read: this fires at commit, so order_items and final values are visible.
  SELECT * INTO v_row FROM public.orders WHERE id = NEW.id;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'completed' THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles WHERE id = v_row.user_id;

  PERFORM public.notify_admin_telegram(
    'orderPaid',
    jsonb_build_object(
      'orderId', v_row.id,
      'orderRef', v_row.order_ref,
      'amount', v_row.total,
      'paymentMethod', v_row.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS order_paid_telegram_alert ON public.orders;
DROP TRIGGER IF EXISTS order_paid_telegram_alert_ins ON public.orders;
DROP TRIGGER IF EXISTS order_paid_telegram_alert_upd ON public.orders;

CREATE CONSTRAINT TRIGGER order_paid_telegram_alert_ins
  AFTER INSERT ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION public.on_order_paid_telegram_alert();

CREATE CONSTRAINT TRIGGER order_paid_telegram_alert_upd
  AFTER UPDATE OF status ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.on_order_paid_telegram_alert();
