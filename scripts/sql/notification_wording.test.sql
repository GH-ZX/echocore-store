-- Tests for 20261114100000_notification_wording.sql (run after money_hardening.test.sql by
-- scripts/test-money-sql.sh, inside the same rolled-back transaction). Invented fixtures only.
-- Telegram messages are read back from pg_net's queue (nothing leaves the machine).
\set ON_ERROR_STOP 1
SET client_min_messages = warning;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('echocore.allow_balance_change', '', true);

-- Telegram on, two admin chats: 9001 (no language saved: Arabic), 9002 (English).
-- The buyer has a linked Telegram chat 9003 (Arabic).
UPDATE public.store_settings
SET telegram_alerts_enabled = true, telegram_bot_token = 'TEST-TOKEN', telegram_chat_id = '9001, 9002',
    telegram_alert_prefs = '{}'::jsonb
WHERE id = 1;
INSERT INTO public.telegram_chats (chat_id, lang) VALUES ('9002', 'en'), ('9003', 'ar')
ON CONFLICT (chat_id) DO UPDATE SET lang = EXCLUDED.lang;
UPDATE public.profiles SET telegram_chat_id = '9003' WHERE id = '00000000-0000-4000-8000-0000000000c1';
DELETE FROM net.http_request_queue;

CREATE TEMP TABLE tg_sent AS SELECT ''::text AS chat, ''::text AS body WHERE false;
CREATE OR REPLACE FUNCTION pg_temp.tg_collect() RETURNS void LANGUAGE sql AS $$
  INSERT INTO tg_sent
  SELECT (convert_from(q.body, 'UTF8')::jsonb)->>'chat_id', convert_from(q.body, 'UTF8')
  FROM net.http_request_queue q WHERE q.url LIKE 'https://api.telegram.org/%';
  DELETE FROM net.http_request_queue;
$$;

-- ── a paid order (wallet) ───────────────────────────────────────────────────────────────────
INSERT INTO public.orders (id, user_id, total, payment_method, status, fulfillment_status, order_ref)
VALUES ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000c1', 10, 'balance', 'pending_payment', 'pending', 'EC-T201');
INSERT INTO public.order_items (order_id, offer_id, name_snapshot, price, quantity)
VALUES ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-0000000000f1', '100 Gems', 10, 1);
UPDATE public.orders SET status = 'completed' WHERE id = '00000000-0000-4000-8000-000000000201';
-- the "paid" Telegram alert is a deferred trigger: fire it now
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.tg_collect();

DO $$
DECLARE
  m jsonb;
BEGIN
  -- in-site admin notice carries order number, items and method
  SELECT metadata INTO m FROM public.notifications
  WHERE user_id = '00000000-0000-4000-8000-0000000000a1' AND type = 'admin_purchase_completed'
    AND metadata->>'orderId' = '00000000-0000-4000-8000-000000000201';
  IF m IS NULL OR m->>'orderRef' <> 'EC-T201' OR m->>'items' <> '1× 100 Gems' OR m->>'paymentMethod' <> 'balance' THEN
    RAISE EXCEPTION 'FAIL n1: admin notice metadata %', m;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9001' AND body LIKE '%طلب مدفوع جديد%' AND body LIKE '%EC-T201%'
                 AND body LIKE '%1× 100 Gems%' AND body LIKE '%$10.00%' AND body LIKE '%رصيد المحفظة%'
                 AND body LIKE '%تفاصيل الطلب%') THEN
    RAISE EXCEPTION 'FAIL n2: Arabic admin alert wrong: %', (SELECT string_agg(body, E'\n') FROM tg_sent);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9002' AND body LIKE '%New paid order%' AND body LIKE '%Wallet balance%'
                 AND body LIKE '%Order details%') THEN
    RAISE EXCEPTION 'FAIL n3: English admin alert wrong';
  END IF;
  IF (SELECT count(*) FROM tg_sent WHERE body LIKE '%EC-T201%') <> 2 THEN
    RAISE EXCEPTION 'FAIL n4: expected one alert per admin chat, got %', (SELECT count(*) FROM tg_sent WHERE body LIKE '%EC-T201%');
  END IF;
END $$;
DELETE FROM tg_sent;

-- ── delivered: customer DM in Arabic ────────────────────────────────────────────────────────
SET ROLE service_role;
SELECT public.apply_g2bulk_fulfillment('00000000-0000-4000-8000-000000000201', 'fulfilled', '555', NULL, '{}'::jsonb, NULL);
RESET ROLE;
SELECT pg_temp.tg_collect();
DO $$
DECLARE
  m jsonb;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9003' AND body LIKE '%تم تسليم طلبك%' AND body LIKE '%EC-T201%'
                 AND body LIKE '%' || chr(8294) || '$10.00' || chr(8297) || '%') THEN
    RAISE EXCEPTION 'FAIL n5: customer delivered DM wrong: %', (SELECT string_agg(body, E'\n') FROM tg_sent);
  END IF;
  SELECT metadata INTO m FROM public.notifications
  WHERE user_id = '00000000-0000-4000-8000-0000000000c1' AND metadata->>'orderId' = '00000000-0000-4000-8000-000000000201'
  ORDER BY created_at DESC LIMIT 1;
  IF m->>'orderRef' <> 'EC-T201' OR m->>'items' IS NULL THEN
    RAISE EXCEPTION 'FAIL n6: customer notice lacks order details: %', m;
  END IF;
END $$;
DELETE FROM tg_sent;

-- ── an admin gift is not a "new paid order" ─────────────────────────────────────────────────
INSERT INTO public.orders (id, user_id, total, payment_method, status, fulfillment_status, order_ref)
VALUES ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000c1', 10, 'admin_gift', 'completed', 'pending', 'EC-T202');
INSERT INTO public.order_items (order_id, offer_id, name_snapshot, price, quantity)
VALUES ('00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-0000000000f1', '100 Gems', 10, 1);
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
SELECT pg_temp.tg_collect();
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.notifications WHERE type = 'admin_purchase_completed'
             AND metadata->>'orderId' = '00000000-0000-4000-8000-000000000202')
     OR EXISTS (SELECT 1 FROM tg_sent WHERE body LIKE '%EC-T202%') THEN
    RAISE EXCEPTION 'FAIL n7: admin gift announced as a paid order';
  END IF;
END $$;
DELETE FROM tg_sent;

-- ── top-up: received, then credited for less than asked (SYP invoice) ───────────────────────
INSERT INTO public.recharge_requests (id, user_id, amount, reference, status, payment_method)
VALUES ('00000000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-0000000000c1', 10, 'RCH-T2', 'pending', 'SyriatelCash');
UPDATE public.recharge_requests SET status = 'payment_sent' WHERE id = '00000000-0000-4000-8000-0000000000d2';
SELECT pg_temp.tg_collect();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9003' AND body LIKE '%استلمنا طلب شحن رصيدك%' AND body LIKE '%RCH-T2%') THEN
    RAISE EXCEPTION 'FAIL n8: customer "received" DM wrong';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9001' AND body LIKE '%طلب شحن ينتظر موافقتك%' AND body LIKE '%سيريتل كاش%'
                 AND body LIKE '%مراجعة الطلبات المعلّقة%') THEN
    RAISE EXCEPTION 'FAIL n9: Arabic "top-up waiting" alert wrong: %', (SELECT string_agg(body, E'\n') FROM tg_sent WHERE chat = '9001');
  END IF;
  IF EXISTS (SELECT 1 FROM tg_sent WHERE chat IN ('9001', '9002') AND (body LIKE '%SYP%' OR body LIKE '%رقم العملية%' OR body LIKE '%Transaction id%')) THEN
    RAISE EXCEPTION 'FAIL n15: empty SYP / transaction id line in the alert';
  END IF;
END $$;
DELETE FROM tg_sent;

UPDATE public.recharge_requests SET status = 'approved', credited_amount = 7.5 WHERE id = '00000000-0000-4000-8000-0000000000d2';
SELECT pg_temp.tg_collect();
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9003' AND body LIKE '%أُضيف الرصيد إلى محفظتك%' AND body LIKE '%$7.50%') THEN
    RAISE EXCEPTION 'FAIL n10: "balance added" DM should show the credited $7.50: %', (SELECT string_agg(body, E'\n') FROM tg_sent WHERE chat = '9003');
  END IF;
  IF EXISTS (SELECT 1 FROM tg_sent WHERE chat = '9003' AND body LIKE '%$10.00%') THEN
    RAISE EXCEPTION 'FAIL n11: "balance added" DM shows the requested amount';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications WHERE type = 'admin_recharge_completed'
                 AND metadata->>'requestId' = '00000000-0000-4000-8000-0000000000d2'
                 AND metadata->>'paymentMethod' = 'SyriatelCash') THEN
    RAISE EXCEPTION 'FAIL n12: admin top-up notice lacks the method';
  END IF;
END $$;

-- helpers
DO $$
BEGIN
  IF public.notif_money('10.5') <> '$10.50' OR public.notif_money('x') <> 'x' OR public.notif_money(NULL) <> '' THEN
    RAISE EXCEPTION 'FAIL n13: notif_money';
  END IF;
  IF public.notif_method_label('ShamCashManual', 'ar') <> 'شام كاش (يدوي)' THEN
    RAISE EXCEPTION 'FAIL n14: notif_method_label';
  END IF;
END $$;

SELECT 'notification_wording tests: all passed' AS result;
