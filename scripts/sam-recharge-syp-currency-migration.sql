-- =============================================================================
-- Sam API recharge: user picks USD or SYP; admin sets SYP/USD rate.
-- Credits wallet from actual paidAmount (proportional for SYP / exact for USD).
-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_syp_per_usd numeric(12,2) DEFAULT 135,
  ADD COLUMN IF NOT EXISTS sam_syp_rate_updated_at timestamptz;

ALTER TABLE public.recharge_requests
  ADD COLUMN IF NOT EXISTS pay_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS syp_per_usd_snapshot numeric(12,2),
  ADD COLUMN IF NOT EXISTS credited_amount numeric(10,2);

ALTER TABLE public.recharge_requests
  DROP CONSTRAINT IF EXISTS recharge_requests_pay_currency_check;

ALTER TABLE public.recharge_requests
  ADD CONSTRAINT recharge_requests_pay_currency_check
  CHECK (pay_currency IN ('USD', 'SYP'));

ALTER TABLE public.sam_invoices
  ADD COLUMN IF NOT EXISTS requested_usd_amount numeric(10,2),
  ADD COLUMN IF NOT EXISTS paid_amount numeric(12,2),
  ADD COLUMN IF NOT EXISTS syp_per_usd_snapshot numeric(12,2);

-- ---------------------------------------------------------------------------
-- Admin Sam settings — include SYP rate
-- ---------------------------------------------------------------------------

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
    'sam_syp_per_usd', COALESCE(v_row.sam_syp_per_usd, 135),
    'sam_syp_rate_updated_at', v_row.sam_syp_rate_updated_at,
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
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric);

CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean,
  p_wallet_mode text DEFAULT 'manual',
  p_shamcash_wallet_identifier text DEFAULT null,
  p_syriatel_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD',
  p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false,
  p_clear_api_key boolean DEFAULT false,
  p_syp_per_usd numeric DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
  v_old_rate numeric;
  v_new_rate numeric;
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

  IF p_syp_per_usd IS NOT NULL AND p_syp_per_usd <= 0 THEN
    RAISE EXCEPTION 'SYP per USD rate must be positive';
  END IF;

  SELECT sam_syp_per_usd INTO v_old_rate FROM public.store_settings WHERE id = 1;
  v_trim_key := nullif(trim(p_api_key), '');
  v_new_rate := COALESCE(p_syp_per_usd, v_old_rate, 135);

  UPDATE public.store_settings
  SET
    sam_api_enabled = CASE
      WHEN COALESCE(p_clear_api_key, false) THEN false
      ELSE COALESCE(p_enabled, false)
    END,
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_shamcash_wallet_identifier = COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier),
    sam_syriatel_wallet_identifier = COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_syp_per_usd = CASE
      WHEN p_syp_per_usd IS NOT NULL THEN round(p_syp_per_usd, 2)
      ELSE COALESCE(sam_syp_per_usd, 135)
    END,
    sam_syp_rate_updated_at = CASE
      WHEN p_syp_per_usd IS NOT NULL AND round(p_syp_per_usd, 2) IS DISTINCT FROM round(COALESCE(v_old_rate, 135), 2)
        THEN now()
      ELSE sam_syp_rate_updated_at
    END,
    sam_api_key = CASE
      WHEN COALESCE(p_clear_api_key, false) THEN null
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE sam_api_key
    END,
    sam_webhook_secret = CASE
      WHEN p_regenerate_webhook_secret THEN public.new_sam_webhook_secret()
      WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN public.new_sam_webhook_secret()
      ELSE sam_webhook_secret
    END,
    shamcash_enabled = CASE
      WHEN COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual') = 'api'
        AND COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier) IS NOT NULL
        AND length(trim(COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier))) > 0
      THEN true
      ELSE shamcash_enabled
    END,
    syriatel_enabled = CASE
      WHEN COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual') = 'api'
        AND COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier) IS NOT NULL
        AND length(trim(COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier))) > 0
      THEN true
      ELSE syriatel_enabled
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_sam_api_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean, numeric) TO authenticated;

-- ---------------------------------------------------------------------------
-- Public payment config
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((
      SELECT CASE
        WHEN COALESCE(sam_wallet_mode, 'manual') = 'api' THEN
          sam_api_enabled
          AND sam_shamcash_wallet_identifier IS NOT NULL
          AND length(trim(sam_shamcash_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        ELSE shamcash_enabled
      END
      FROM store_settings WHERE id = 1
    ), false),
    'syriatel', COALESCE((
      SELECT CASE
        WHEN COALESCE(sam_wallet_mode, 'manual') = 'api' THEN
          sam_api_enabled
          AND sam_syriatel_wallet_identifier IS NOT NULL
          AND length(trim(sam_syriatel_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        ELSE syriatel_enabled
      END
      FROM store_settings WHERE id = 1
    ), false),
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
    'rechargeMin', 1,
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
        AND sam_shamcash_wallet_identifier IS NOT NULL
        AND length(trim(sam_shamcash_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samSyriatelApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_syriatel_wallet_identifier IS NOT NULL
        AND length(trim(sam_syriatel_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
        AND (
          (sam_shamcash_wallet_identifier IS NOT NULL AND length(trim(sam_shamcash_wallet_identifier)) > 0)
          OR (sam_syriatel_wallet_identifier IS NOT NULL AND length(trim(sam_syriatel_wallet_identifier)) > 0)
        )
      FROM store_settings WHERE id = 1
    ), false),
    'samInvoiceCurrency', COALESCE((SELECT sam_invoice_currency FROM store_settings WHERE id = 1), 'USD'),
    'sypPerUsd', COALESCE((SELECT sam_syp_per_usd FROM store_settings WHERE id = 1), 135),
    'sypRateUpdatedAt', (SELECT sam_syp_rate_updated_at FROM store_settings WHERE id = 1),
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true),
    'g2bulkCatalogMode', COALESCE((SELECT g2bulk_catalog_mode FROM store_settings WHERE id = 1), 'sync'),
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- create_recharge_request — pay currency (API mode)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_recharge_request(
  p_amount numeric,
  p_payment_method text DEFAULT 'ShamCash',
  p_pay_currency text DEFAULT 'USD'
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
  v_wallet_mode text;
  v_pay_currency text := upper(COALESCE(nullif(trim(p_pay_currency), ''), 'USD'));
  v_syp_rate numeric(12,2);
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF public.is_admin() THEN
    RAISE EXCEPTION 'Admin accounts cannot recharge store balance from the storefront';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(v_user_id);
    PERFORM public.assert_user_verified_if_required(v_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  IF v_method NOT IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  IF v_pay_currency NOT IN ('USD', 'SYP') THEN
    RAISE EXCEPTION 'Invalid pay currency';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount < 1 OR v_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $1 and $500';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual'), COALESCE(sam_syp_per_usd, 135)
  INTO v_wallet_mode, v_syp_rate
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode <> 'api' AND v_pay_currency = 'SYP' THEN
    RAISE EXCEPTION 'SYP recharge is only available in Sam API mode';
  END IF;

  IF v_pay_currency = 'SYP' AND (v_syp_rate IS NULL OR v_syp_rate <= 0) THEN
    RAISE EXCEPTION 'SYP exchange rate is not configured';
  END IF;

  IF v_wallet_mode = 'api' THEN
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_shamcash_wallet_identifier IS NOT NULL
          AND length(trim(sam_shamcash_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API ShamCash recharge is not configured yet';
      END IF;
    ELSE
      SELECT COALESCE((
        SELECT sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_syriatel_wallet_identifier IS NOT NULL
          AND length(trim(sam_syriatel_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
  ELSE
    v_pay_currency := 'USD';
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

  INSERT INTO recharge_requests (
    user_id, amount, reference, status, payment_method, pay_currency, syp_per_usd_snapshot
  )
  VALUES (
    v_user_id,
    v_amount,
    v_reference,
    'pending',
    v_method,
    v_pay_currency,
    CASE WHEN v_pay_currency = 'SYP' THEN round(v_syp_rate, 2) ELSE NULL END
  )
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'requestId', v_request_id,
    'reference', v_reference,
    'amount', v_amount,
    'status', 'pending',
    'paymentMethod', v_method,
    'payCurrency', v_pay_currency,
    'sypPerUsd', CASE WHEN v_pay_currency = 'SYP' THEN round(v_syp_rate, 2) ELSE NULL END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Active recharge — expose pay currency
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_active_recharge_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_invoice jsonb;
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

  SELECT jsonb_build_object(
    'samInvoiceId', si.sam_invoice_id,
    'paymentUrl', si.payment_url,
    'expiresAt', si.expires_at,
    'amount', si.amount,
    'currency', si.currency,
    'status', si.status,
    'requestedUsdAmount', si.requested_usd_amount
  )
  INTO v_invoice
  FROM sam_invoices si
  WHERE si.entity_type = 'recharge'
    AND si.entity_id = v_row.id
    AND si.status IN ('pending', 'paid')
  ORDER BY si.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', v_row.status,
    'paymentMethod', v_row.payment_method,
    'payCurrency', COALESCE(v_row.pay_currency, 'USD'),
    'sypPerUsd', v_row.syp_per_usd_snapshot,
    'createdAt', v_row.created_at,
    'invoice', v_invoice
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Credit actual paid amount (USD exact / SYP proportional)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.complete_recharge_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
  v_paid numeric(12,2);
  v_credit numeric(10,2);
  v_rate numeric(12,2);
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'recharge' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status = 'approved' THEN
    SELECT balance INTO v_new_balance
    FROM public.profiles
    WHERE id = v_row.user_id;

    RETURN jsonb_build_object(
      'requestId', v_row.id,
      'userId', v_row.user_id,
      'amount', COALESCE(v_row.credited_amount, v_row.amount),
      'requestedAmount', v_row.amount,
      'creditedAmount', COALESCE(v_row.credited_amount, v_row.amount),
      'newBalance', v_new_balance,
      'status', 'approved',
      'skipped', true
    );
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Recharge request is not awaiting payment confirmation';
  END IF;

  v_paid := round(COALESCE(v_inv.paid_amount, v_inv.amount)::numeric, 2);

  IF v_paid IS NULL OR v_paid <= 0 THEN
    RAISE EXCEPTION 'Paid amount is missing or invalid';
  END IF;

  IF v_inv.currency = 'SYP' THEN
    v_rate := COALESCE(
      v_inv.syp_per_usd_snapshot,
      v_row.syp_per_usd_snapshot,
      (SELECT sam_syp_per_usd FROM store_settings WHERE id = 1)
    );
    IF v_rate IS NULL OR v_rate <= 0 THEN
      RAISE EXCEPTION 'SYP exchange rate is not configured';
    END IF;
    v_credit := round(v_paid / v_rate, 2);
  ELSE
    v_credit := round(v_paid, 2);
  END IF;

  IF v_credit < 0.01 THEN
    RAISE EXCEPTION 'Paid amount too small to credit';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_credit
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_credit, v_new_balance, v_row.payment_method, v_ref, 'completed');

  UPDATE public.recharge_requests
  SET
    status = 'approved',
    credited_amount = v_credit,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id,
      'amount', v_credit,
      'requestedAmount', v_row.amount,
      'creditedAmount', v_credit,
      'paidAmount', v_paid,
      'payCurrency', v_inv.currency,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'userId', v_row.user_id,
    'amount', v_credit,
    'requestedAmount', v_row.amount,
    'creditedAmount', v_credit,
    'paidAmount', v_paid,
    'payCurrency', v_inv.currency,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;