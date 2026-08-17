-- Binance Pay merchant integration: receive USDT customer recharges.
-- Additive to the existing Sam API recharge flow — both methods coexist.

-- =============================================================
-- 1. store_settings: Binance Pay credentials (server-side only)
-- =============================================================
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_api_key text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_api_secret text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_cert_sn text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_merchant_id text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_webhook_secret text;
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS binance_api_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_settings.binance_api_key IS
  'Binance Pay API key / Certificate SN value used in BinancePay-Certificate-SN header (admin UI only; never expose to anon).';
COMMENT ON COLUMN public.store_settings.binance_api_secret IS
  'HMAC-SHA512 signing secret for Binance Pay requests (admin UI only; never expose).';
COMMENT ON COLUMN public.store_settings.binance_cert_sn IS
  'Binance Pay Certificate serial number (BinancePay-Certificate-SN). Falls back to api_key when blank.';
COMMENT ON COLUMN public.store_settings.binance_merchant_id IS
  'Binance Pay Merchant ID (informational / sub-merchant context).';
COMMENT ON COLUMN public.store_settings.binance_webhook_secret IS
  'Shared query-string secret appended to the webhook URL to reject spoofed calls.';
COMMENT ON COLUMN public.store_settings.binance_api_enabled IS
  'When true and keys are configured, Binance Pay is offered as a recharge method to customers.';

-- =============================================================
-- 2. binance_pay_orders: per-recharge Binance Pay order rows
-- =============================================================
CREATE TABLE IF NOT EXISTS public.binance_pay_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recharge_request_id uuid REFERENCES public.recharge_requests(id) ON DELETE CASCADE,
  entity_type text NOT NULL DEFAULT 'recharge'
    CHECK (entity_type IN ('recharge', 'order')),
  prepay_id text,
  merchant_trade_no text NOT NULL UNIQUE,
  order_amount numeric(10,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USDT',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','expired','failed','cancelled')),
  paid_amount numeric(12,2),
  transaction_ref text,
  checkout_url text,
  biz_status text,
  webhook_received_at timestamptz,
  webhook_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS binance_pay_orders_recharge_idx
  ON public.binance_pay_orders (recharge_request_id);
CREATE INDEX IF NOT EXISTS binance_pay_orders_status_idx
  ON public.binance_pay_orders (status, created_at DESC);

ALTER TABLE public.binance_pay_orders ENABLE ROW LEVEL SECURITY;

-- Service role (edge functions) bypasses RLS; users never read this table directly.
DROP POLICY IF EXISTS "Service role full binance_pay_orders" ON public.binance_pay_orders;
CREATE POLICY "Service role full binance_pay_orders" ON public.binance_pay_orders
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =============================================================
-- 3. RPC: credit a customer balance after a paid Binance Pay order.
--    Mirrors complete_recharge_from_sam_invoice but keyed off
--    binance_pay_orders.merchant_trade_no. Idempotent per paid order.
-- =============================================================
CREATE OR REPLACE FUNCTION public.complete_recharge_from_binance_pay_order(p_merchant_trade_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ord public.binance_pay_orders%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
  v_paid numeric(12,2);
  v_credit numeric(10,2);
BEGIN
  SELECT * INTO v_ord
  FROM public.binance_pay_orders
  WHERE merchant_trade_no = p_merchant_trade_no
  FOR UPDATE;

  IF v_ord.id IS NULL THEN
    RAISE EXCEPTION 'Binance Pay order not found';
  END IF;

  IF v_ord.entity_type IS DISTINCT FROM 'recharge' OR v_ord.recharge_request_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_ord.recharge_request_id
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

  -- SECURITY: only credit after Binance confirmed the payment via the signed
  -- /order/query (webhook handler sets paid_amount from that query). Never fall
  -- back to the requested order amount — a spoofed webhook must not mint balance.
  IF v_ord.paid_amount IS NULL OR v_ord.paid_amount <= 0 THEN
    RAISE EXCEPTION 'Paid amount is not confirmed by Binance';
  END IF;

  IF v_ord.paid_amount < v_ord.order_amount THEN
    RAISE EXCEPTION 'Paid amount is less than the requested order amount';
  END IF;

  -- Binance Pay recharges are USD-equivalent USDT. Credit = confirmed paid USD,
  -- capped at the requested order amount (never credit more than requested).
  v_paid := round(v_ord.paid_amount::numeric, 2);
  v_credit := round(LEAST(v_paid, v_ord.order_amount), 2);

  IF v_credit < 0.01 THEN
    RAISE EXCEPTION 'Paid amount too small to credit';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_ord.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_ord.merchant_trade_no
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_credit
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_credit, v_new_balance, 'Binance Pay', v_ref, 'completed');

  UPDATE public.recharge_requests
  SET
    status = 'approved',
    credited_amount = v_credit,
    reviewed_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  UPDATE public.binance_pay_orders
  SET
    status = 'paid',
    paid_amount = v_credit,
    webhook_received_at = COALESCE(webhook_received_at, now()),
    updated_at = now()
  WHERE id = v_ord.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id,
      'amount', v_credit,
      'requestedAmount', v_row.amount,
      'creditedAmount', v_credit,
      'paidAmount', v_paid,
      'payCurrency', v_ord.currency,
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
    'payCurrency', v_ord.currency,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_recharge_from_binance_pay_order(text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_recharge_from_binance_pay_order(text) TO service_role;

-- =============================================================
-- 4. get_payment_methods(): add binanceApiEnabled / binanceApiReady.
--    Full redefinition preserves ALL existing fields (shamcash/syriatel/
--    sam/g2bulk) — only appends the two new binance fields.
-- =============================================================
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
    'binance', COALESCE((
      SELECT binance_enabled
        AND binance_api_enabled
        AND binance_api_key IS NOT NULL
        AND length(trim(binance_api_key)) > 0
        AND binance_api_secret IS NOT NULL
        AND length(trim(binance_api_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
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
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb),
    'binanceApiEnabled', COALESCE((SELECT binance_api_enabled FROM store_settings WHERE id = 1), false),
    'binanceApiReady', COALESCE((
      SELECT binance_api_enabled
        AND binance_api_key IS NOT NULL
        AND length(trim(binance_api_key)) > 0
        AND binance_api_secret IS NOT NULL
        AND length(trim(binance_api_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;