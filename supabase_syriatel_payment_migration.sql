-- =============================================================================
-- ECHOCORE — Syriatel Cash + dual Sam API wallets (standalone)
-- =============================================================================
-- Run once in Supabase SQL Editor after supabase_sam_api_migration.sql (if used).
-- Adds Syriatel Cash manual payments alongside ShamCash; splits API receiving
-- wallets per provider.
-- =============================================================================

-- Webhook token helper (no pgcrypto — gen_random_bytes may be unavailable)
CREATE OR REPLACE FUNCTION public.new_sam_webhook_secret()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

-- 1. Syriatel manual columns
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS syriatel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS syriatel_qr_image_url text,
  ADD COLUMN IF NOT EXISTS syriatel_pay_code text;

-- 2. Dual Sam API receiving wallets (store wallets where customers pay)
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_shamcash_wallet_identifier text,
  ADD COLUMN IF NOT EXISTS sam_syriatel_wallet_identifier text;

-- Migrate legacy single wallet identifier
UPDATE public.store_settings
SET
  sam_shamcash_wallet_identifier = COALESCE(
    sam_shamcash_wallet_identifier,
    CASE WHEN COALESCE(sam_invoice_method, 'shamcash') = 'shamcash' THEN sam_wallet_identifier END
  ),
  sam_syriatel_wallet_identifier = COALESCE(
    sam_syriatel_wallet_identifier,
    CASE WHEN sam_invoice_method = 'syriatel' THEN sam_wallet_identifier END
  )
WHERE id = 1;

-- 3. Recharge RPC — accept ShamCash or SyriatelCash
DROP FUNCTION IF EXISTS public.create_recharge_request(numeric);

CREATE OR REPLACE FUNCTION public.create_recharge_request(
  p_amount numeric,
  p_payment_method text DEFAULT 'ShamCash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(10,2);
  v_reference text;
  v_request_id uuid;
  v_method_ready boolean;
  v_active_count int;
  v_method text := COALESCE(nullif(trim(p_payment_method), ''), 'ShamCash');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF v_method NOT IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount < 5 OR v_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $5 and $500';
  END IF;

  IF v_method = 'ShamCash' THEN
    SELECT COALESCE((
      SELECT shamcash_enabled
        AND shamcash_qr_image_url IS NOT NULL
        AND length(trim(shamcash_qr_image_url)) > 0
        AND shamcash_pay_code IS NOT NULL
        AND length(trim(shamcash_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false) INTO v_method_ready;
    IF NOT v_method_ready THEN
      RAISE EXCEPTION 'Manual ShamCash recharge is not configured yet';
    END IF;
  ELSE
    SELECT COALESCE((
      SELECT syriatel_enabled
        AND syriatel_qr_image_url IS NOT NULL
        AND length(trim(syriatel_qr_image_url)) > 0
        AND syriatel_pay_code IS NOT NULL
        AND length(trim(syriatel_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false) INTO v_method_ready;
    IF NOT v_method_ready THEN
      RAISE EXCEPTION 'Manual Syriatel Cash recharge is not configured yet';
    END IF;
  END IF;

  SELECT count(*)::int INTO v_active_count
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent');

  IF v_active_count >= 1 THEN
    RAISE EXCEPTION 'You already have a pending recharge request';
  END IF;

  v_reference := 'ECHOCORE-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6))
    || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));

  INSERT INTO recharge_requests (user_id, amount, reference, status, payment_method)
  VALUES (v_user_id, v_amount, v_reference, 'pending', v_method)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'requestId', v_request_id,
    'reference', v_reference,
    'amount', v_amount,
    'status', 'pending',
    'paymentMethod', v_method
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text) TO authenticated;

-- 4. Order creation — SyriatelCash manual checkout (patch existing function)
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
  v_dev_test_balance numeric := 0;
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
    SET
      balance = balance - p_total,
      dev_test_balance = GREATEST(0, dev_test_balance - p_total)
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance, dev_test_balance INTO v_new_balance, v_dev_test_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles WHERE id = p_user_id;

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
    ELSIF p_payment_method = 'SyriatelCash' THEN
      SELECT COALESCE((
        SELECT syriatel_enabled
          AND syriatel_qr_image_url IS NOT NULL
          AND length(trim(syriatel_qr_image_url)) > 0
          AND syriatel_pay_code IS NOT NULL
          AND length(trim(syriatel_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_manual_ready;

      IF NOT v_manual_ready THEN
        RAISE EXCEPTION 'Manual Syriatel Cash payment is not configured yet';
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
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, ''))
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
    'devTestBalance', v_dev_test_balance,
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;

-- 5. Sam API admin RPCs — dual receiving wallets
CREATE OR REPLACE FUNCTION public.get_sam_api_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
  v_wh text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.sam_api_key), '');
  v_wh := nullif(trim(v_row.sam_webhook_secret), '');

  RETURN jsonb_build_object(
    'sam_api_enabled', COALESCE(v_row.sam_api_enabled, false),
    'sam_wallet_mode', COALESCE(v_row.sam_wallet_mode, 'manual'),
    'sam_shamcash_wallet_identifier', v_row.sam_shamcash_wallet_identifier,
    'sam_syriatel_wallet_identifier', v_row.sam_syriatel_wallet_identifier,
    'sam_invoice_currency', COALESCE(v_row.sam_invoice_currency, 'USD'),
    'sam_api_key_set', v_key IS NOT NULL,
    'sam_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END,
    'sam_webhook_secret_set', v_wh IS NOT NULL,
    'sam_webhook_secret_masked', CASE
      WHEN v_wh IS NULL THEN null
      WHEN length(v_wh) <= 8 THEN '********'
      ELSE substr(v_wh, 1, 6) || '…'
    END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean,
  p_wallet_mode text DEFAULT 'manual',
  p_shamcash_wallet_identifier text DEFAULT null,
  p_syriatel_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD',
  p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_wallet_mode IS NOT NULL AND p_wallet_mode NOT IN ('manual', 'api') THEN
    RAISE EXCEPTION 'Invalid wallet mode';
  END IF;

  IF p_invoice_currency IS NOT NULL AND p_invoice_currency NOT IN ('USD', 'SYP', 'EUR') THEN
    RAISE EXCEPTION 'Invalid invoice currency';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    sam_api_enabled = COALESCE(p_enabled, false),
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_shamcash_wallet_identifier = COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier),
    sam_syriatel_wallet_identifier = COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE sam_api_key
    END,
    sam_webhook_secret = CASE
      WHEN p_regenerate_webhook_secret THEN public.new_sam_webhook_secret()
      WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN public.new_sam_webhook_secret()
      ELSE sam_webhook_secret
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_sam_api_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean) TO authenticated;

-- 6. Public payment config
CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((SELECT shamcash_enabled FROM store_settings WHERE id = 1), false),
    'syriatel', COALESCE((SELECT syriatel_enabled FROM store_settings WHERE id = 1), false),
    'binance', COALESCE((SELECT binance_enabled FROM store_settings WHERE id = 1), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'ECHOCORE Store'),
    'shamcashQrImageUrl', (SELECT shamcash_qr_image_url FROM store_settings WHERE id = 1),
    'shamcashPayCode', (SELECT shamcash_pay_code FROM store_settings WHERE id = 1),
    'syriatelQrImageUrl', (SELECT syriatel_qr_image_url FROM store_settings WHERE id = 1),
    'syriatelPayCode', (SELECT syriatel_pay_code FROM store_settings WHERE id = 1),
    'shamcashManualReady', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_qr_image_url IS NOT NULL
        AND length(trim(shamcash_qr_image_url)) > 0
        AND shamcash_pay_code IS NOT NULL
        AND length(trim(shamcash_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'syriatelManualReady', COALESCE((
      SELECT syriatel_enabled
        AND syriatel_qr_image_url IS NOT NULL
        AND length(trim(syriatel_qr_image_url)) > 0
        AND syriatel_pay_code IS NOT NULL
        AND length(trim(syriatel_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'rechargeMin', 5,
    'rechargeMax', 500,
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'walletMode', COALESCE((SELECT sam_wallet_mode FROM store_settings WHERE id = 1), 'manual'),
    'samShamcashApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_shamcash_wallet_identifier IS NOT NULL
        AND length(trim(sam_shamcash_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samSyriatelApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_syriatel_wallet_identifier IS NOT NULL
        AND length(trim(sam_syriatel_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
        AND (
          (sam_shamcash_wallet_identifier IS NOT NULL AND length(trim(sam_shamcash_wallet_identifier)) > 0)
          OR (sam_syriatel_wallet_identifier IS NOT NULL AND length(trim(sam_syriatel_wallet_identifier)) > 0)
        )
      FROM store_settings WHERE id = 1
    ), false),
    'samInvoiceCurrency', COALESCE((SELECT sam_invoice_currency FROM store_settings WHERE id = 1), 'USD'),
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true),
    'g2bulkCatalogMode', COALESCE((SELECT g2bulk_catalog_mode FROM store_settings WHERE id = 1), 'sync'),
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- 7. Include payment method in active recharge response
CREATE OR REPLACE FUNCTION public.get_my_active_recharge_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', v_row.status,
    'paymentMethod', v_row.payment_method,
    'createdAt', v_row.created_at
  );
END;
$$;

-- Done. Redeploy sam-api edge function if you updated saveSettings payload.