-- Telegram: delivery logging, recharge DMs, order-details button; deduct_user_balance hardening
--  1. deduct_user_balance: lock the profile row so concurrent calls cannot overspend
--  2. telegram_delivery_log + telegram_post(): every send is recorded and its outcome
--     (HTTP status / Telegram description) is resolved from pg_net's response table
--  3. get_telegram_delivery_stats(): admin dashboard health numbers (never sent to Telegram)
--  4. Recharge DMs (payment_sent / approved / rejected) for BOTH dashboard and bot paths
--  5. Admin order alerts get an "Order details" button

-- =============================================================================
-- 1. deduct_user_balance: row lock + guarded update
-- =============================================================================
CREATE OR REPLACE FUNCTION public.deduct_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'balance',
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  current_bal numeric;
  new_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduct amount must be positive';
  END IF;

  -- Lock the row: two concurrent deductions must not both pass the balance check.
  SELECT balance INTO current_bal FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF current_bal IS NULL OR current_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
    SET balance = balance - p_amount
    WHERE id = p_user_id AND balance >= p_amount
    RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'purchase', -p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

-- =============================================================================
-- 2. Delivery log
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.telegram_delivery_log (
  id bigserial PRIMARY KEY,
  request_id bigint,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  ok boolean,
  status_code int,
  error text
);

ALTER TABLE public.telegram_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_delivery_log FROM public, anon, authenticated;
GRANT ALL ON public.telegram_delivery_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.telegram_delivery_log_id_seq TO service_role;

CREATE INDEX IF NOT EXISTS telegram_delivery_log_created_idx
  ON public.telegram_delivery_log (created_at DESC);
CREATE INDEX IF NOT EXISTS telegram_delivery_log_unresolved_idx
  ON public.telegram_delivery_log (request_id) WHERE resolved_at IS NULL;

-- Fill in outcomes from pg_net's response table (kept only a few hours by pg_net).
CREATE OR REPLACE FUNCTION public.telegram_resolve_deliveries()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
BEGIN
  UPDATE public.telegram_delivery_log l
  SET resolved_at = now(),
      status_code = r.status_code,
      ok = (r.status_code BETWEEN 200 AND 299),
      error = CASE
        WHEN r.status_code BETWEEN 200 AND 299 THEN NULL
        ELSE left(COALESCE(
          nullif(r.error_msg, ''),
          substring(r.content FROM '"description":"([^"]*)"'),
          'HTTP ' || COALESCE(r.status_code::text, '?')
        ), 200)
      END
  FROM net._http_response r
  WHERE l.resolved_at IS NULL
    AND l.request_id IS NOT NULL
    AND r.id = l.request_id;

  -- Responses are purged by pg_net after a few hours; never leave rows pending forever.
  UPDATE public.telegram_delivery_log
  SET resolved_at = now(), error = 'no response recorded'
  WHERE resolved_at IS NULL AND created_at < now() - interval '3 hours';
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_resolve_deliveries() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_resolve_deliveries() TO service_role;

-- Single choke point for outgoing Telegram messages: send + remember the request id.
CREATE OR REPLACE FUNCTION public.telegram_post(
  p_token text,
  p_body jsonb,
  p_kind text,
  p_timeout_ms int DEFAULT 10000
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_id bigint;
BEGIN
  BEGIN
    v_id := net.http_post(
      url := 'https://api.telegram.org/bot' || p_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := p_body,
      timeout_milliseconds := p_timeout_ms
    );
    INSERT INTO public.telegram_delivery_log (request_id, kind) VALUES (v_id, left(p_kind, 60));
  EXCEPTION WHEN OTHERS THEN
    BEGIN
      INSERT INTO public.telegram_delivery_log (kind, resolved_at, ok, error)
      VALUES (left(p_kind, 60), now(), false, 'enqueue failed');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END;

  PERFORM public.telegram_resolve_deliveries();

  IF random() < 0.02 THEN
    DELETE FROM public.telegram_delivery_log WHERE created_at < now() - interval '14 days';
  END IF;
EXCEPTION WHEN OTHERS THEN
  NULL; -- never block the triggering transaction
END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_post(text, jsonb, text, int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_post(text, jsonb, text, int) TO service_role;

-- =============================================================================
-- 3. Admin health numbers (dashboard only)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_telegram_delivery_stats()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.telegram_resolve_deliveries();

  SELECT jsonb_build_object(
    'window_hours', 24,
    'sent', count(*) FILTER (WHERE ok IS TRUE),
    'failed', count(*) FILTER (WHERE ok IS FALSE),
    'pending', count(*) FILTER (WHERE resolved_at IS NULL),
    'last_error', (SELECT error FROM public.telegram_delivery_log
                   WHERE ok IS FALSE AND created_at > now() - interval '24 hours'
                   ORDER BY created_at DESC LIMIT 1),
    'last_error_at', (SELECT created_at FROM public.telegram_delivery_log
                      WHERE ok IS FALSE AND created_at > now() - interval '24 hours'
                      ORDER BY created_at DESC LIMIT 1),
    'last_ok_at', (SELECT max(created_at) FROM public.telegram_delivery_log WHERE ok IS TRUE)
  )
  INTO v_result
  FROM public.telegram_delivery_log
  WHERE created_at > now() - interval '24 hours';

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_telegram_delivery_stats() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_telegram_delivery_stats() TO authenticated, service_role;

-- =============================================================================
-- 4. Admin alerts: through telegram_post, with an "Order details" button
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_admin_telegram(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_chats text[];
  v_chat text;
  v_token text;
  v_text text;
  v_link text;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_order_id uuid;
  v_body jsonb;
  v_rows jsonb;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  IF NOT COALESCE(v_row.telegram_alerts_enabled, false) THEN
    RETURN;
  END IF;

  v_token := nullif(trim(COALESCE(v_row.telegram_bot_token, '')), '');
  v_chats := public.telegram_admin_chat_ids(v_row.telegram_chat_id);
  IF v_token IS NULL OR cardinality(v_chats) = 0 THEN
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

  v_rows := '[]'::jsonb;
  IF v_order_id IS NOT NULL THEN
    v_rows := v_rows || jsonb_build_array(jsonb_build_array(
      jsonb_build_object('text', '📍 Order details', 'callback_data', 'track:' || v_order_id::text)
    ));
  END IF;
  IF v_link IS NOT NULL THEN
    v_rows := v_rows || jsonb_build_array(jsonb_build_array(
      jsonb_build_object('text', '🔎 Open in dashboard', 'url', v_link)
    ));
  END IF;

  FOREACH v_chat IN ARRAY v_chats LOOP
    v_body := jsonb_build_object(
      'chat_id', v_chat,
      'text', left(v_text, 3500),
      'parse_mode', 'HTML',
      'disable_web_page_preview', true
    );
    IF jsonb_array_length(v_rows) > 0 THEN
      v_body := v_body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', v_rows));
    END IF;
    PERFORM public.telegram_post(v_token, v_body, 'admin:' || p_type, 30000);
  END LOOP;

  BEGIN
    PERFORM public.try_append_site_log(
      'telegram', p_type, 'info', NULL, NULL,
      jsonb_build_object('length', length(v_text), 'chats', cardinality(v_chats))
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- =============================================================================
-- 5. Customer DMs: shared helper + recharge notifications
-- =============================================================================
-- Resolves the user's linked chat and language (default Arabic, like the order DMs).
CREATE OR REPLACE FUNCTION public.telegram_dm_user(
  p_user_id uuid,
  p_kind text,
  p_ar text,
  p_en text,
  p_btn_ar jsonb DEFAULT '[]'::jsonb,
  p_btn_en jsonb DEFAULT '[]'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions AS $$
DECLARE
  v_chat_id text;
  v_token text;
  v_ar boolean;
  v_buttons jsonb;
  v_body jsonb;
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = p_user_id AND telegram_chat_id IS NOT NULL AND telegram_chat_id <> '';
  IF v_chat_id IS NULL THEN RETURN; END IF;

  SELECT nullif(trim(telegram_bot_token), '') INTO v_token FROM public.store_settings WHERE id = 1;
  IF v_token IS NULL THEN RETURN; END IF;

  v_ar := COALESCE((SELECT lang = 'ar' FROM public.telegram_chats WHERE chat_id = v_chat_id), true);
  v_buttons := CASE WHEN v_ar THEN p_btn_ar ELSE p_btn_en END;

  v_body := jsonb_build_object(
    'chat_id', v_chat_id,
    'text', left(CASE WHEN v_ar THEN p_ar ELSE p_en END, 3500),
    'parse_mode', 'HTML',
    'disable_web_page_preview', true
  );
  IF jsonb_array_length(COALESCE(v_buttons, '[]'::jsonb)) > 0 THEN
    v_body := v_body || jsonb_build_object('reply_markup', jsonb_build_object('inline_keyboard', v_buttons));
  END IF;

  PERFORM public.telegram_post(v_token, v_body, 'customer:' || p_kind);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_dm_user(uuid, text, text, text, jsonb, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_dm_user(uuid, text, text, text, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.on_recharge_status_telegram_dm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_balance numeric;
  v_amt text := '$' || trim(to_char(NEW.amount, 'FM999999990.00'));
BEGIN
  IF NEW.status = 'payment_sent' THEN
    PERFORM public.telegram_dm_user(
      NEW.user_id, 'recharge_review',
      '⏳ <b>استلمنا طلب الشحن</b>' || E'\n' || 'المبلغ: <b>' || v_amt || '</b>' || E'\n' || 'نراجع الدفعة وسنخبرك فور اعتمادها.',
      '⏳ <b>Recharge request received</b>' || E'\n' || 'Amount: <b>' || v_amt || '</b>' || E'\n' || 'We are reviewing your payment and will notify you once it is approved.',
      '[]'::jsonb, '[]'::jsonb
    );
  ELSIF NEW.status = 'approved' THEN
    SELECT balance INTO v_balance FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.telegram_dm_user(
      NEW.user_id, 'recharge_approved',
      '✅ <b>تمت إضافة الرصيد!</b>' || E'\n' || 'المبلغ: <b>' || v_amt || '</b>' || E'\n'
        || 'رصيدك الجديد: <b>$' || trim(to_char(COALESCE(v_balance, 0), 'FM999999990.00')) || '</b>',
      '✅ <b>Recharge approved!</b>' || E'\n' || 'Amount: <b>' || v_amt || '</b>' || E'\n'
        || 'New balance: <b>$' || trim(to_char(COALESCE(v_balance, 0), 'FM999999990.00')) || '</b>',
      jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', '🛒 تسوّق الآن', 'callback_data', 'menu'),
        jsonb_build_object('text', '💰 رصيدي', 'callback_data', 'my_balance'))),
      jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', '🛒 Shop now', 'callback_data', 'menu'),
        jsonb_build_object('text', '💰 My balance', 'callback_data', 'my_balance')))
    );
  ELSIF NEW.status = 'rejected' THEN
    PERFORM public.telegram_dm_user(
      NEW.user_id, 'recharge_rejected',
      '❌ <b>تم رفض طلب الشحن</b>' || E'\n' || 'المبلغ: ' || v_amt || E'\n\n' || 'تواصل مع الدعم إن كنت تعتقد أن هناك خطأ.',
      '❌ <b>Recharge rejected</b>' || E'\n' || 'Amount: ' || v_amt || E'\n\n' || 'Contact support if you believe this is a mistake.',
      jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', '💬 تواصل مع الدعم', 'url', 'https://www.echocore412.com/contact'))),
      jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', '💬 Contact support', 'url', 'https://www.echocore412.com/contact')))
    );
  END IF;
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL; -- never block a recharge because of a notification
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_recharge_status_telegram_dm() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS recharge_status_telegram_dm ON public.recharge_requests;
CREATE TRIGGER recharge_status_telegram_dm
  AFTER UPDATE OF status ON public.recharge_requests
  FOR EACH ROW
  WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status IN ('payment_sent', 'approved', 'rejected'))
  EXECUTE FUNCTION public.on_recharge_status_telegram_dm();

-- =============================================================================
-- 6. Order fulfilment DMs now go through telegram_post (delivery is logged)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.notify_linked_user_telegram()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_chat_id text;
  v_token text;
  v_text text;
  v_order_ref text;
  v_items text;
  v_buttons jsonb;
  v_refunded boolean;
  v_ar boolean;
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

  SELECT nullif(trim(telegram_bot_token), '') INTO v_token
  FROM public.store_settings WHERE id = 1;
  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  v_ar := COALESCE((SELECT lang = 'ar' FROM public.telegram_chats WHERE chat_id = v_chat_id), true);
  v_order_ref := COALESCE(NEW.order_ref, LEFT(NEW.id::text, 8));
  v_items := public.telegram_order_items_text(NEW.id);
  v_refunded := COALESCE((NEW.g2bulk_metadata->>'balance_refunded')::boolean, false);

  IF NEW.fulfillment_status = 'fulfilled' THEN
    v_text := CASE WHEN v_ar THEN '🎉 <b>تم تسليم طلبك!</b>' ELSE '🎉 <b>Order delivered!</b>' END || E'\n'
      || CASE WHEN v_ar THEN 'الطلب: ' ELSE 'Order: ' END || '<code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || CASE WHEN v_ar THEN 'المبلغ: ' ELSE 'Amount: ' END || '<b>$' || NEW.total::text || '</b>';
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '📄 عرض الفاتورة' ELSE '📄 View invoice' END, 'url', 'https://www.echocore412.com/invoice/order/' || NEW.id::text)),
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '📦 طلباتي' ELSE '📦 My orders' END, 'callback_data', 'my_orders'))
    );
  ELSE
    v_text := CASE WHEN v_ar THEN '❌ <b>لم نتمكن من إتمام طلبك</b>' ELSE '❌ <b>We could not complete your order</b>' END || E'\n'
      || CASE WHEN v_ar THEN 'الطلب: ' ELSE 'Order: ' END || '<code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || CASE WHEN v_ar THEN 'المبلغ: ' ELSE 'Amount: ' END || '<b>$' || NEW.total::text || '</b>';
    IF v_refunded THEN
      v_text := v_text || E'\n\n' || CASE WHEN v_ar THEN '💰 تم إرجاع المبلغ إلى رصيدك.' ELSE '💰 Your balance has been refunded.' END;
    ELSE
      v_text := v_text || E'\n\n' || CASE WHEN v_ar THEN 'فريقنا يتابع الطلب.' ELSE 'Our team is looking into it.' END;
    END IF;
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '💬 تواصل مع الدعم' ELSE '💬 Contact support' END, 'url', 'https://www.echocore412.com/contact'))
    );
    IF v_refunded THEN
      v_buttons := jsonb_build_array(
        jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '🛒 تصفح المتجر' ELSE '🛒 Browse store' END, 'url', 'https://www.echocore412.com'))
      ) || v_buttons;
    END IF;
  END IF;

  BEGIN
    PERFORM public.telegram_post(
      v_token,
      jsonb_build_object(
        'chat_id', v_chat_id,
        'text', left(v_text, 3500),
        'parse_mode', 'HTML',
        'disable_web_page_preview', true,
        'reply_markup', jsonb_build_object('inline_keyboard', v_buttons)
      ),
      'customer:fulfillment_' || NEW.fulfillment_status
    );
    PERFORM public.try_append_site_log(
      'telegram', 'customer_fulfillment_' || NEW.fulfillment_status, 'info',
      NEW.user_id, NULL,
      jsonb_build_object('orderId', NEW.id, 'orderRef', v_order_ref)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;
