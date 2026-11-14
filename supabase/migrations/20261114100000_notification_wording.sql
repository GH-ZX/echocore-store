-- Recharge and purchase notifications: clearer wording and fixes (2026-11-14).
-- Findings: docs/notifications-2026-11-14.md. Bodies replaced here are the live ones of 2026-11-14
-- with only the changes described; pre-change bodies are saved in echocore_backup.function_snapshots
-- (label '2026-11-14-notification-wording'). Rollback:
-- supabase/migrations/revert/20261114100000_revert_notification_wording.sql
--
-- 1. notify_user adds the order number, items and payment method to every notification about an
--    order, and the reference / method to every notification about a top-up (keys already in the
--    metadata win), so the site can say what happened, how much, what and which order.
-- 2. Customer Telegram DMs (top-up received / added / refused, order delivered / failed): new
--    Arabic (Modern Standard) and English; the "added" DM shows the amount actually credited.
-- 3. Admin Telegram alerts for paid order, failed delivery, top-up added and top-up waiting follow
--    each admin chat's language (Arabic by default), with Arabic buttons. Other alerts unchanged.
-- 4. Admin gifts are no longer announced to the admins as "new paid order".
-- 5. The "top-up waiting" alert no longer shows an empty "( SYP)" / "Transaction id" line.

-- ── 0. Snapshot ─────────────────────────────────────────────────────────────────────────────
INSERT INTO echocore_backup.function_snapshots (label, proname, args, definition, authenticated_exec, anon_exec)
SELECT '2026-11-14-notification-wording', p.proname, oidvectortypes(p.proargtypes),
       pg_get_functiondef(p.oid),
       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('notify_user', 'notify_admin_telegram', 'on_recharge_status_telegram_dm',
                    'notify_linked_user_telegram', 'on_order_completed_notify_admins',
                    'on_order_paid_telegram_alert');

-- ── helpers ─────────────────────────────────────────────────────────────────────────────────
-- "$10.00" from a number or its text; the text itself when it isn't a number.
CREATE OR REPLACE FUNCTION public.notif_money(p_value text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
BEGIN
  IF p_value IS NULL OR trim(p_value) = '' THEN
    RETURN '';
  END IF;
  RETURN '$' || to_char(round(p_value::numeric, 2), 'FM999999990.00');
EXCEPTION WHEN OTHERS THEN
  RETURN p_value;
END;
$$;

-- Keeps numbers, codes and Latin names left-to-right inside Arabic text (Unicode isolate).
CREATE OR REPLACE FUNCTION public.notif_ltr(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN p_text IS NULL OR p_text = '' THEN '' ELSE chr(8294) || p_text || chr(8297) END;
$$;

CREATE OR REPLACE FUNCTION public.notif_method_label(p_method text, p_lang text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_method IS NULL OR trim(p_method) = '' THEN '—'
    WHEN p_method = 'balance' THEN CASE WHEN p_lang = 'ar' THEN 'رصيد المحفظة' ELSE 'Wallet balance' END
    WHEN p_method IN ('ShamCash', 'shamcash') THEN CASE WHEN p_lang = 'ar' THEN 'شام كاش' ELSE 'ShamCash' END
    WHEN p_method = 'ShamCashManual' THEN CASE WHEN p_lang = 'ar' THEN 'شام كاش (يدوي)' ELSE 'ShamCash (manual)' END
    WHEN p_method IN ('SyriatelCash', 'syriatelcash') THEN CASE WHEN p_lang = 'ar' THEN 'سيريتل كاش' ELSE 'Syriatel Cash' END
    WHEN p_method = 'admin_manual' THEN CASE WHEN p_lang = 'ar' THEN 'إضافة من الإدارة' ELSE 'Added by the store' END
    WHEN p_method = 'admin_gift' THEN CASE WHEN p_lang = 'ar' THEN 'هدية من الإدارة' ELSE 'Gift from the store' END
    ELSE p_method
  END;
$$;

REVOKE ALL ON FUNCTION public.notif_money(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_ltr(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.notif_method_label(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notif_money(text), public.notif_ltr(text), public.notif_method_label(text, text) TO service_role;

-- ── 1. notify_user: order / top-up details in every notification ────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_user(p_user_id uuid, p_type text, p_metadata jsonb DEFAULT '{}'::jsonb, p_link text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_extra jsonb := '{}'::jsonb;
  v_ref text;
  v_method text;
  v_items text;
  v_lines integer;
BEGIN
  IF p_user_id IS NULL OR p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RETURN NULL;
  END IF;

  -- Details for the message (never blocks the notification).
  BEGIN
    IF (v_meta->>'orderId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT o.order_ref, o.payment_method INTO v_ref, v_method
      FROM public.orders o WHERE o.id = (v_meta->>'orderId')::uuid;
      SELECT string_agg(GREATEST(1, COALESCE(x.quantity, 1))::text || '× ' || left(COALESCE(x.name_snapshot, '—'), 60),
                        ' · ' ORDER BY x.id),
             max(x.n)
      INTO v_items, v_lines
      FROM (
        SELECT oi.id, oi.quantity, oi.name_snapshot, count(*) OVER () AS n
        FROM public.order_items oi
        WHERE oi.order_id = (v_meta->>'orderId')::uuid
        ORDER BY oi.id
        LIMIT 3
      ) x;
      IF v_lines > 3 THEN
        v_items := v_items || ' +' || (v_lines - 3)::text;
      END IF;
      v_extra := jsonb_strip_nulls(jsonb_build_object('orderRef', v_ref, 'items', v_items, 'paymentMethod', v_method));
    ELSIF (v_meta->>'requestId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      SELECT r.reference, r.payment_method INTO v_ref, v_method
      FROM public.recharge_requests r WHERE r.id = (v_meta->>'requestId')::uuid;
      v_extra := jsonb_strip_nulls(jsonb_build_object('reference', v_ref, 'paymentMethod', v_method));
    END IF;
    v_meta := v_extra || v_meta;
  EXCEPTION WHEN OTHERS THEN
    v_meta := COALESCE(p_metadata, '{}'::jsonb);
  END;

  INSERT INTO public.notifications (user_id, type, metadata, link)
  VALUES (p_user_id, p_type, v_meta, p_link)
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
$function$;

-- ── 2. Customer Telegram DMs ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_recharge_status_telegram_dm()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_balance numeric;
  v_amt text := public.notif_money(NEW.amount::text);
  v_added text := public.notif_money(COALESCE(NEW.credited_amount, NEW.amount)::text);
  v_ref text := public.telegram_escape(NEW.reference);
  v_note text := public.telegram_escape(left(NULLIF(trim(COALESCE(NEW.admin_note, '')), ''), 300));
BEGIN
  IF NEW.status = 'payment_sent' THEN
    PERFORM public.telegram_dm_user(
      NEW.user_id, 'recharge_review',
      '⏳ <b>استلمنا طلب شحن رصيدك</b>' || E'\n'
        || 'المبلغ: <b>' || public.notif_ltr(v_amt) || '</b>' || E'\n'
        || CASE WHEN v_ref <> '' THEN 'المرجع: <code>' || v_ref || '</code>' || E'\n' ELSE '' END
        || 'سنراجع الدفعة ونرسل لك رسالة عند إضافتها إلى رصيدك.',
      '⏳ <b>We received your top-up request</b>' || E'\n'
        || 'Amount: <b>' || v_amt || '</b>' || E'\n'
        || CASE WHEN v_ref <> '' THEN 'Reference: <code>' || v_ref || '</code>' || E'\n' ELSE '' END
        || 'We will check the payment and message you when it is added to your balance.',
      '[]'::jsonb, '[]'::jsonb
    );
  ELSIF NEW.status = 'approved' THEN
    SELECT balance INTO v_balance FROM public.profiles WHERE id = NEW.user_id;
    PERFORM public.telegram_dm_user(
      NEW.user_id, 'recharge_approved',
      '✅ <b>أُضيف الرصيد إلى محفظتك</b>' || E'\n'
        || 'المبلغ المضاف: <b>' || public.notif_ltr(v_added) || '</b>' || E'\n'
        || 'رصيدك الآن: <b>' || public.notif_ltr(public.notif_money(COALESCE(v_balance, 0)::text)) || '</b>',
      '✅ <b>Balance added</b>' || E'\n'
        || 'Added: <b>' || v_added || '</b>' || E'\n'
        || 'Your balance now: <b>' || public.notif_money(COALESCE(v_balance, 0)::text) || '</b>',
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
      '❌ <b>لم يُقبل طلب الشحن</b>' || E'\n'
        || 'المبلغ: ' || public.notif_ltr(v_amt) || E'\n'
        || CASE WHEN v_note <> '' THEN 'السبب: ' || v_note || E'\n' ELSE '' END || E'\n'
        || 'لم نتمكن من التحقق من الدفعة. إذا كنت قد دفعت، راسلنا مع إيصال الدفع.',
      '❌ <b>Top-up not accepted</b>' || E'\n'
        || 'Amount: ' || v_amt || E'\n'
        || CASE WHEN v_note <> '' THEN 'Reason: ' || v_note || E'\n' ELSE '' END || E'\n'
        || 'We could not confirm the payment. If you paid, contact us with your receipt.',
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
$function$;

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
  v_amt text;
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
  v_amt := public.notif_money(NEW.total::text);

  IF NEW.fulfillment_status = 'fulfilled' THEN
    v_text := CASE WHEN v_ar THEN '🎉 <b>تم تسليم طلبك</b>' ELSE '🎉 <b>Your order was delivered</b>' END || E'\n'
      || CASE WHEN v_ar THEN 'الطلب: ' ELSE 'Order: ' END || '<code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || CASE WHEN v_ar THEN 'المبلغ: <b>' || public.notif_ltr(v_amt) || '</b>' ELSE 'Amount: <b>' || v_amt || '</b>' END || E'\n\n'
      || CASE WHEN v_ar THEN 'تجد التفاصيل والكود (إن وُجد) في الفاتورة.' ELSE 'The details, and any code, are on the invoice.' END;
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '📄 عرض الفاتورة' ELSE '📄 View invoice' END, 'url', 'https://www.echocore412.com/invoice/order/' || NEW.id::text)),
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '📦 طلباتي' ELSE '📦 My orders' END, 'callback_data', 'my_orders'))
    );
  ELSE
    v_text := CASE WHEN v_ar THEN '❌ <b>تعذّر تسليم طلبك</b>' ELSE '❌ <b>We could not deliver your order</b>' END || E'\n'
      || CASE WHEN v_ar THEN 'الطلب: ' ELSE 'Order: ' END || '<code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || CASE WHEN v_ar THEN 'المبلغ: <b>' || public.notif_ltr(v_amt) || '</b>' ELSE 'Amount: <b>' || v_amt || '</b>' END;
    IF v_refunded THEN
      v_text := v_text || E'\n\n' || CASE WHEN v_ar THEN '💰 أعدنا المبلغ إلى رصيدك.' ELSE '💰 We returned the amount to your balance.' END;
    ELSE
      v_text := v_text || E'\n\n' || CASE WHEN v_ar THEN 'يتابع فريقنا الطلب، وسنرسل لك النتيجة هنا.' ELSE 'Our team is on it and will message you here.' END;
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

-- ── 3. Admin Telegram alerts in the admin chat's language ───────────────────────────────────
-- Paid order, failed delivery, top-up added, top-up waiting. NULL for every other alert type,
-- which keeps telegram_alert_message (English) as before.
CREATE OR REPLACE FUNCTION public.telegram_alert_text(p_type text, p_metadata jsonb, p_lang text)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
DECLARE
  m jsonb := COALESCE(p_metadata, '{}'::jsonb);
  ar boolean := COALESCE(p_lang, 'ar') <> 'en';
  v_amt text := public.notif_money(m->>'amount');
  v_amt_ar text := public.notif_ltr(public.notif_money(m->>'amount'));
  v_ref text := public.telegram_escape(m->>'orderRef');
  v_items text := COALESCE(NULLIF(m->>'items', '') || E'\n', '');
  v_user text := public.telegram_escape(COALESCE(NULLIF(m->>'userName', ''), CASE WHEN ar THEN 'عميل' ELSE 'Customer' END));
  v_method text := public.telegram_escape(public.notif_method_label(m->>'paymentMethod', CASE WHEN ar THEN 'ar' ELSE 'en' END));
  v_reference text := public.telegram_escape(m->>'reference');  -- '' when missing
  v_error text := CASE WHEN NULLIF(m->>'error', '') IS NOT NULL THEN public.telegram_escape(left(m->>'error', 200)) END;
BEGIN
  IF p_type = 'orderPaid' THEN
    RETURN CASE WHEN ar THEN
        '🟢 <b>طلب مدفوع جديد</b>' || E'\n'
      || 'الطلب: <code>' || v_ref || '</code>' || E'\n' || v_items
      || 'المبلغ: <b>' || v_amt_ar || '</b>' || E'\n'
      || 'طريقة الدفع: ' || v_method || E'\n'
      || 'العميل: ' || v_user
    ELSE
        '🟢 <b>New paid order</b>' || E'\n'
      || 'Order: <code>' || v_ref || '</code>' || E'\n' || v_items
      || 'Amount: <b>' || v_amt || '</b>' || E'\n'
      || 'Paid with: ' || v_method || E'\n'
      || 'Customer: ' || v_user
    END;
  ELSIF p_type = 'fulfillmentFail' THEN
    RETURN CASE WHEN ar THEN
        '🔴 <b>فشل تسليم طلب</b>' || E'\n'
      || 'الطلب: <code>' || v_ref || '</code>' || E'\n' || v_items
      || 'المبلغ: <b>' || v_amt_ar || '</b>' || E'\n'
      || 'العميل: ' || v_user || E'\n'
      || CASE WHEN v_error IS NOT NULL THEN 'السبب: ' || v_error || E'\n' ELSE '' END
      || 'أعد المحاولة أو أرجع المبلغ إلى رصيد العميل من الأزرار أدناه.'
    ELSE
        '🔴 <b>Order delivery failed</b>' || E'\n'
      || 'Order: <code>' || v_ref || '</code>' || E'\n' || v_items
      || 'Amount: <b>' || v_amt || '</b>' || E'\n'
      || 'Customer: ' || v_user || E'\n'
      || CASE WHEN v_error IS NOT NULL THEN 'Reason: ' || v_error || E'\n' ELSE '' END
      || 'Retry, or refund the customer''s balance, with the buttons below.'
    END;
  ELSIF p_type = 'recharge' THEN
    RETURN CASE WHEN ar THEN
        '🟢 <b>أُضيف رصيد إلى محفظة عميل</b>' || E'\n'
      || 'المبلغ: <b>' || v_amt_ar || '</b>' || E'\n'
      || 'الطريقة: ' || v_method || E'\n'
      || CASE WHEN v_reference <> '' THEN 'المرجع: <code>' || v_reference || '</code>' || E'\n' ELSE '' END
      || 'العميل: ' || v_user
    ELSE
        '🟢 <b>Top-up added to a wallet</b>' || E'\n'
      || 'Amount: <b>' || v_amt || '</b>' || E'\n'
      || 'Method: ' || v_method || E'\n'
      || CASE WHEN v_reference <> '' THEN 'Reference: <code>' || v_reference || '</code>' || E'\n' ELSE '' END
      || 'Customer: ' || v_user
    END;
  ELSIF p_type = 'rechargePending' THEN
    RETURN CASE WHEN ar THEN
        '🟡 <b>طلب شحن ينتظر موافقتك</b>' || E'\n'
      || 'المبلغ: <b>' || v_amt_ar || '</b>'
      || CASE WHEN NULLIF(m->>'sypAmount', '') IS NOT NULL THEN ' (' || public.notif_ltr(public.telegram_escape(m->>'sypAmount') || ' SYP') || ')' ELSE '' END || E'\n'
      || 'الطريقة: ' || v_method || E'\n'
      || 'المرجع: <code>' || v_reference || '</code>' || E'\n'
      || CASE WHEN NULLIF(m->>'txnRef', '') IS NOT NULL THEN 'رقم العملية: <code>' || public.telegram_escape(m->>'txnRef') || '</code>' || E'\n' ELSE '' END
      || CASE WHEN m->>'txnConflict' = 'true' THEN '⚠️ <b>رقم العملية هذا مستخدم في طلب آخر، فتحقق منه جيداً.</b>' || E'\n' ELSE '' END
      || CASE WHEN m->>'hasReceipt' = 'true' THEN 'إيصال الدفع: مرفق (افتحه من لوحة التحكم)' || E'\n' ELSE '' END
      || 'العميل: ' || v_user || E'\n'
      || 'تحقق في شام كاش من المبلغ والمرسل، ومن أن ملاحظة التحويل تحتوي المرجع أعلاه.'
    ELSE
        '🟡 <b>Top-up waiting for your approval</b>' || E'\n'
      || 'Amount: <b>' || v_amt || '</b>'
      || CASE WHEN NULLIF(m->>'sypAmount', '') IS NOT NULL THEN ' (' || public.telegram_escape(m->>'sypAmount') || ' SYP)' ELSE '' END || E'\n'
      || 'Method: ' || v_method || E'\n'
      || 'Reference: <code>' || v_reference || '</code>' || E'\n'
      || CASE WHEN NULLIF(m->>'txnRef', '') IS NOT NULL THEN 'Transaction id: <code>' || public.telegram_escape(m->>'txnRef') || '</code>' || E'\n' ELSE '' END
      || CASE WHEN m->>'txnConflict' = 'true' THEN '⚠️ <b>This transaction id is also used by another request: check it carefully.</b>' || E'\n' ELSE '' END
      || CASE WHEN m->>'hasReceipt' = 'true' THEN 'Receipt: attached (open the dashboard)' || E'\n' ELSE '' END
      || 'Customer: ' || v_user || E'\n'
      || 'In ShamCash, check the amount, the sender, and that the transfer note contains the reference above.'
    END;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_alert_text(text, jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_alert_text(text, jsonb, text) TO service_role;

-- Live body with the text and buttons chosen per admin chat (telegram_chats.lang, Arabic by default).
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
  v_lang text;
  v_ar boolean;
  v_sent integer := 0;
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

  v_link := public.telegram_alert_link(p_type, v_meta);

  FOREACH v_chat IN ARRAY v_chats LOOP
    v_lang := COALESCE((SELECT c.lang FROM public.telegram_chats c WHERE c.chat_id = v_chat), 'ar');
    v_ar := v_lang <> 'en';
    v_text := COALESCE(public.telegram_alert_text(p_type, v_meta, v_lang), public.telegram_alert_message(p_type, v_meta));
    IF v_text IS NULL OR v_text = '' THEN
      CONTINUE;
    END IF;

    v_rows := '[]'::jsonb;
    IF p_type = 'fulfillmentFail' AND v_order_id IS NOT NULL THEN
      v_rows := v_rows || jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', CASE WHEN v_ar THEN '🔁 إعادة المحاولة' ELSE '🔁 Retry' END, 'callback_data', 'rt:' || v_order_id::text),
        jsonb_build_object('text', CASE WHEN v_ar THEN '💰 إرجاع المبلغ' ELSE '💰 Refund' END, 'callback_data', 'rf:' || v_order_id::text)
      ));
    END IF;
    IF p_type = 'rechargePending' THEN
      -- Opens the pending list in the bot (admin reviews, then approves/rejects there).
      v_rows := v_rows || jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', CASE WHEN v_ar THEN '📋 مراجعة الطلبات المعلّقة' ELSE '📋 Review pending' END, 'callback_data', 'admin_pending')
      ));
    END IF;
    IF v_order_id IS NOT NULL THEN
      v_rows := v_rows || jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', CASE WHEN v_ar THEN '📍 تفاصيل الطلب' ELSE '📍 Order details' END, 'callback_data', 'track:' || v_order_id::text)
      ));
    END IF;
    IF v_link IS NOT NULL THEN
      v_rows := v_rows || jsonb_build_array(jsonb_build_array(
        jsonb_build_object('text', CASE WHEN v_ar THEN '🔎 فتح في لوحة التحكم' ELSE '🔎 Open in dashboard' END, 'url', v_link)
      ));
    END IF;

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
    v_sent := v_sent + 1;
  END LOOP;

  BEGIN
    PERFORM public.try_append_site_log(
      'telegram', p_type, 'info', NULL, NULL,
      jsonb_build_object('length', length(v_text), 'chats', v_sent)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;

-- ── 4. Admin gifts are not "new paid orders" ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.on_order_completed_notify_admins()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- A gift from the admin is not a sale: no "new paid order" notice (it stays in the log).
  IF NEW.payment_method IS DISTINCT FROM 'admin_gift' THEN
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
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.on_order_paid_telegram_alert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_name text;
  v_row public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.orders WHERE id = NEW.id;
  IF NOT FOUND OR v_row.status IS DISTINCT FROM 'completed' THEN
    RETURN NULL;
  END IF;
  IF v_row.payment_method = 'admin_gift' THEN
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
$function$;
