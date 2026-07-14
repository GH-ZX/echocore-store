-- =============================================================================
-- Hotfix: restore create_recharge_request(numeric, text, text) after a failed
-- sam-recharge-syp-currency-migration run (old REVOKE-after-DROP bug).
-- Safe to run multiple times.
-- =============================================================================

-- Ensure columns exist (no-op if migration already applied)
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

DROP FUNCTION IF EXISTS public.create_recharge_request(numeric);
DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

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

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text, text) TO authenticated;