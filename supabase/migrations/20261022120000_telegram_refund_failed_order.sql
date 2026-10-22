-- Telegram: admin refund of a failed order + Retry/Refund buttons on the failure alert
--  * telegram_refund_failed_order(): row-locked, mirrors the automatic refund in
--    apply_g2bulk_fulfillment (same FULFILL-REFUND-xxxx reference => idempotent), refuses when the
--    order was already refunded, is not a failed balance order, has delivery evidence, or is locked.
--  * notify_admin_telegram: fulfillmentFail alerts get Retry / Refund buttons.
--    (Buttons only open a confirm screen in the bot; nothing runs from the alert tap itself.)

CREATE OR REPLACE FUNCTION public.telegram_refund_failed_order(p_order_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_meta jsonb;
  v_ref text;
  v_new_balance numeric;
  v_amt text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb);
  v_ref := 'FULFILL-REFUND-' || upper(left(replace(p_order_id::text, '-', ''), 8));

  IF v_meta->>'balance_refunded' = 'true'
     OR EXISTS (SELECT 1 FROM public.transactions WHERE type = 'refund' AND reference = v_ref) THEN
    RAISE EXCEPTION 'refund_already';
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed' OR v_order.fulfillment_status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'refund_not_failed';
  END IF;

  IF v_order.payment_method IS DISTINCT FROM 'balance' OR v_order.user_id IS NULL OR COALESCE(v_order.total, 0) <= 0 THEN
    RAISE EXCEPTION 'refund_not_balance';
  END IF;

  IF v_meta->>'do_not_refulfill' = 'true' OR v_meta->>'free_after_refund' = 'true' THEN
    RAISE EXCEPTION 'refund_locked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id
      AND delivery_items IS NOT NULL
      AND jsonb_typeof(delivery_items) = 'array'
      AND jsonb_array_length(delivery_items) > 0
  ) THEN
    RAISE EXCEPTION 'refund_delivered';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_order.total
  WHERE id = v_order.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_order.user_id, 'refund', v_order.total, v_new_balance, 'balance', v_ref, 'completed');

  UPDATE public.orders
  SET g2bulk_metadata = v_meta || jsonb_build_object(
    'balance_refunded', true,
    'refunded_at', now(),
    'refund_balance', v_new_balance,
    'refund_reference', v_ref,
    'refund_via', 'telegram_admin',
    'refund_by', p_admin_id
  )
  WHERE id = p_order_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'fulfillment_failed_refunded',
    jsonb_build_object('orderId', p_order_id, 'amount', v_order.total, 'newBalance', v_new_balance),
    '/profile'
  );

  PERFORM public.try_append_site_log(
    'order', 'refund_via_telegram', 'info', v_order.user_id, p_admin_id,
    jsonb_build_object('orderId', p_order_id, 'orderRef', v_order.order_ref,
                       'amount', v_order.total, 'newBalance', v_new_balance)
  );

  v_amt := '$' || trim(to_char(v_order.total, 'FM999999990.00'));
  PERFORM public.telegram_dm_user(
    v_order.user_id, 'order_refunded',
    '💰 <b>تم إرجاع المبلغ إلى رصيدك</b>' || E'\n' || 'الطلب: <code>' || public.telegram_escape(v_order.order_ref) || '</code>' || E'\n'
      || 'المبلغ: <b>' || v_amt || '</b>',
    '💰 <b>Your balance has been refunded</b>' || E'\n' || 'Order: <code>' || public.telegram_escape(v_order.order_ref) || '</code>' || E'\n'
      || 'Amount: <b>' || v_amt || '</b>',
    jsonb_build_array(jsonb_build_array(jsonb_build_object('text', '💰 رصيدي', 'callback_data', 'my_balance'))),
    jsonb_build_array(jsonb_build_array(jsonb_build_object('text', '💰 My balance', 'callback_data', 'my_balance')))
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'orderRef', v_order.order_ref,
    'userId', v_order.user_id,
    'amount', v_order.total,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.telegram_refund_failed_order(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_refund_failed_order(uuid, uuid) TO service_role;

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
  IF p_type = 'fulfillmentFail' AND v_order_id IS NOT NULL THEN
    v_rows := v_rows || jsonb_build_array(jsonb_build_array(
      jsonb_build_object('text', '🔁 Retry', 'callback_data', 'rt:' || v_order_id::text),
      jsonb_build_object('text', '💰 Refund', 'callback_data', 'rf:' || v_order_id::text)
    ));
  END IF;
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
