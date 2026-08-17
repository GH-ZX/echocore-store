-- =============================================================================
-- MIGRATION: Telegram admin alerts (store-level, one bot + one chat)
-- -----------------------------------------------------------------------------
-- Adds Telegram alerts for store events: new paid order, recharge approved,
-- fulfillment failure/refund, low G2Bulk wallet, contact message, customer
-- review, and new signup. One store bot token + one recipient chat id, all
-- configured by an admin under Dashboard → APIs → Telegram alerts.
--
-- Sending is fire-and-forget through pg_net: a Telegram outage never blocks
-- the triggering transaction (send errors are swallowed inside
-- notify_admin_telegram).
--
-- Apply: supabase db query --linked -f migration-telegram-admin-alerts.sql
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. Store-level config columns
-- -----------------------------------------------------------------------------

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS telegram_alerts_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_bot_token text,
  ADD COLUMN IF NOT EXISTS telegram_bot_username text,
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_alert_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- -----------------------------------------------------------------------------
-- 2. Message helpers
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.telegram_escape(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT replace(replace(replace(COALESCE(p_text, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
$$;

CREATE OR REPLACE FUNCTION public.telegram_alert_message(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT CASE p_type
    WHEN 'orderPaid' THEN
        '<b>New order paid</b>' || E'\n'
      || 'Order: ' || public.telegram_escape(p_metadata->>'orderRef') || E'\n'
      || 'Amount: ' || public.telegram_escape(p_metadata->>'amount') || E'\n'
      || 'Payment: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'fulfillmentFail' THEN
        '<b>Order fulfillment FAILED</b>' || E'\n'
      || 'Order: ' || public.telegram_escape(p_metadata->>'orderRef') || E'\n'
      || 'Amount: ' || public.telegram_escape(p_metadata->>'amount') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName') || E'\n'
      || 'Error: ' || public.telegram_escape(p_metadata->>'error')
    WHEN 'recharge' THEN
        '<b>Recharge approved</b>' || E'\n'
      || 'Amount: ' || public.telegram_escape(p_metadata->>'amount') || E'\n'
      || 'Method: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Reference: ' || public.telegram_escape(p_metadata->>'reference') || E'\n'
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName')
    WHEN 'contact' THEN
        '<b>New contact message</b>' || E'\n'
      || 'From: ' || public.telegram_escape(p_metadata->>'name') || E'\n'
      || 'Email: ' || public.telegram_escape(p_metadata->>'email') || E'\n'
      || 'Message: ' || public.telegram_escape(p_metadata->>'message')
    WHEN 'review' THEN
        '<b>New customer review</b>' || E'\n'
      || 'Author: ' || public.telegram_escape(p_metadata->>'authorName') || E'\n'
      || 'Rating: ' || public.telegram_escape(p_metadata->>'rating') || '/5' || E'\n'
      || 'Message: ' || public.telegram_escape(p_metadata->>'message')
    WHEN 'signup' THEN
        '<b>New customer signup</b>' || E'\n'
      || 'Name: ' || public.telegram_escape(p_metadata->>'name') || E'\n'
      || 'Username: ' || public.telegram_escape(p_metadata->>'username') || E'\n'
      || 'Email: ' || public.telegram_escape(p_metadata->>'email')
    WHEN 'lowWallet' THEN
        '<b>G2Bulk wallet is low</b>' || E'\n'
      || 'Top up the supplier wallet so fulfillment can continue.' || E'\n'
      || 'Order: ' || public.telegram_escape(p_metadata->>'orderRef') || E'\n'
      || 'Detail: ' || public.telegram_escape(p_metadata->>'detail')
    WHEN 'test' THEN
        '<b>ECHOCORE Telegram alerts — test message</b>' || E'\n'
      || 'If you can read this, alerts are working.'
    ELSE
      NULL
  END;
$$;

-- -----------------------------------------------------------------------------
-- 3. Fire-and-forget sender (gate: enabled + token + chat + per-event pref)
-- -----------------------------------------------------------------------------

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
  v_url text;
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

  v_text := public.telegram_alert_message(p_type, COALESCE(p_metadata, '{}'::jsonb));
  IF v_text IS NULL OR v_text = '' THEN
    RETURN;
  END IF;

  BEGIN
    v_url := 'https://api.telegram.org/bot' || v_token || '/sendMessage';
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'chat_id', v_chat,
        'text', left(v_text, 3900),
        'parse_mode', 'HTML'
      )
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

-- -----------------------------------------------------------------------------
-- 4. Admin settings RPCs (bot token is masked, never returned raw)
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_telegram_alerts_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_token text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_token := nullif(trim(COALESCE(v_row.telegram_bot_token, '')), '');

  RETURN jsonb_build_object(
    'telegram_alerts_enabled', COALESCE(v_row.telegram_alerts_enabled, false),
    'telegram_bot_token_set', v_token IS NOT NULL,
    'telegram_bot_token_masked', CASE
      WHEN v_token IS NULL THEN null
      WHEN length(v_token) <= 8 THEN '********'
      ELSE substr(v_token, 1, 4) || '…' || substr(v_token, length(v_token) - 3, 4)
    END,
    'telegram_bot_username', v_row.telegram_bot_username,
    'telegram_chat_id', v_row.telegram_chat_id,
    'telegram_alert_prefs', COALESCE(v_row.telegram_alert_prefs, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_telegram_alerts_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_telegram_alerts_settings() TO authenticated;

CREATE OR REPLACE FUNCTION public.save_telegram_alerts_settings(
  p_enabled boolean DEFAULT null,
  p_bot_token text DEFAULT null,
  p_bot_username text DEFAULT null,
  p_chat_id text DEFAULT null,
  p_alert_prefs jsonb DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_token text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_trim_token := nullif(trim(p_bot_token), '');

  UPDATE public.store_settings
  SET
    telegram_alerts_enabled = COALESCE(p_enabled, telegram_alerts_enabled, false),
    telegram_bot_username = COALESCE(nullif(trim(p_bot_username), ''), telegram_bot_username),
    telegram_chat_id = COALESCE(nullif(trim(p_chat_id), ''), telegram_chat_id),
    telegram_alert_prefs = COALESCE(p_alert_prefs, telegram_alert_prefs, '{}'::jsonb),
    telegram_bot_token = CASE
      WHEN p_bot_token IS NOT NULL THEN v_trim_token
      ELSE telegram_bot_token
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_telegram_alerts_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_telegram_alerts_settings(boolean, text, text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.save_telegram_alerts_settings(boolean, text, text, text, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.send_test_telegram_alert()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  PERFORM public.notify_admin_telegram('test', jsonb_build_object('sentAt', now()));
  RETURN 'sent';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_test_telegram_alert() FROM public;
GRANT EXECUTE ON FUNCTION public.send_test_telegram_alert() TO authenticated;

-- -----------------------------------------------------------------------------
-- 5. Wire the existing event triggers to also send Telegram alerts
--    (CREATE OR REPLACE keeps the triggers attached; re-created for idempotency)
-- -----------------------------------------------------------------------------

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

  -- Orders tab with highlight — not invoice (invoice only after fulfillment success)
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
      'phase', 'payment'  -- payment only; delivery is a separate notification
    ),
    v_link
  );

  PERFORM public.notify_admin_telegram(
    'orderPaid',
    jsonb_build_object(
      'orderRef', NEW.order_ref,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  PERFORM public.try_append_site_log(
    'order',
    v_event,
    'info',
    NEW.user_id,
    NULL,
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

DROP TRIGGER IF EXISTS order_completed_notify_admins ON public.orders;
CREATE TRIGGER order_completed_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_completed_notify_admins();

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
    PERFORM public.notify_admin_telegram(
      'fulfillmentFail',
      jsonb_build_object(
        'orderRef', NEW.order_ref,
        'amount', NEW.total,
        'userName', COALESCE(v_user_name, 'Customer'),
        'error', COALESCE(NEW.g2bulk_metadata->>'last_error', 'fulfillment failed')
      )
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

  PERFORM public.notify_admin_telegram(
    'recharge',
    jsonb_build_object(
      'amount', v_amount,
      'reference', NEW.reference,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
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

  PERFORM public.notify_admin_telegram(
    'contact',
    jsonb_build_object(
      'name', NEW.name,
      'email', NEW.email,
      'message', left(coalesce(NEW.message, ''), 200)
    )
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

CREATE OR REPLACE FUNCTION public.on_customer_review_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NEW.is_seed IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM 'pending' THEN
    RETURN NEW;
  END IF;

  PERFORM public.notify_all_admins(
    'admin_customer_review',
    jsonb_build_object(
      'reviewId', NEW.id,
      'authorName', NEW.author_name,
      'userName', NEW.author_name,
      'rating', NEW.rating,
      'message', left(coalesce(NEW.content, ''), 200),
      'orderId', NEW.order_id
    ),
    '/dashboard/reviews'
  );

  PERFORM public.notify_admin_telegram(
    'review',
    jsonb_build_object(
      'authorName', NEW.author_name,
      'rating', NEW.rating,
      'message', left(coalesce(NEW.content, ''), 200)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS customer_review_notify_admins ON public.customer_reviews;
CREATE TRIGGER customer_review_notify_admins
  AFTER INSERT ON public.customer_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.on_customer_review_insert();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_username text;
  v_gender text;
  v_dob text;
  v_date date;
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(new.email, '')));
  v_name := NULLIF(trim(COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full name',
    ''
  )), '');

  -- Prefer explicit signup username (email form)
  v_username := lower(trim(COALESCE(new.raw_user_meta_data->>'username', '')));
  v_username := regexp_replace(COALESCE(v_username, ''), '^@+', '');

  IF v_username = '' THEN
    -- Google / OTP / no username chosen → from email (xxxxxx@gmail.com → xxxxxx)
    v_username := public.generate_default_username(v_email);
  ELSIF length(v_username) < 4
     OR length(v_username) > 20
     OR v_username !~ '^[a-z][a-z0-9]*' THEN
    -- Invalid metadata: fall back to email-based instead of failing OAuth
    v_username := public.generate_default_username(v_email);
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p WHERE lower(p.username) = v_username
  ) THEN
    v_username := public.generate_default_username(v_email);
  END IF;

  v_gender := lower(trim(COALESCE(new.raw_user_meta_data->>'gender', '')));
  v_dob := nullif(trim(COALESCE(new.raw_user_meta_data->>'date_of_birth', '')), '');

  IF v_gender NOT IN ('male', 'female') THEN
    v_gender := NULL;
  END IF;

  IF v_dob IS NOT NULL THEN
    BEGIN
      v_date := v_dob::date;
      IF v_date > CURRENT_DATE OR v_date < (CURRENT_DATE - INTERVAL '120 years') THEN
        v_date := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_date := NULL;
    END;
  END IF;

  -- Display name: Google full name, else email local-part, else username
  IF v_name IS NULL OR v_name = '' THEN
    v_name := NULLIF(public.username_seed_from_email(v_email), '');
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    v_name := v_username;
  END IF;

  INSERT INTO public.profiles (id, role, name, username, gender, date_of_birth)
  VALUES (
    new.id,
    'user',
    v_name,
    v_username,
    v_gender,
    v_date
  )
  ON CONFLICT (id) DO NOTHING;

  PERFORM public.notify_admin_telegram(
    'signup',
    jsonb_build_object(
      'name', v_name,
      'username', v_username,
      'email', v_email
    )
  );

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;
