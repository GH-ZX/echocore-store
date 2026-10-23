-- ShamCash manual fallback (runs ALONGSIDE Sam API mode)
--  * Admin enables it in Admin > Payments (toggle + ShamCash wallet id in shamcash_pay_code; QR optional).
--  * Recharge method id 'ShamCashManual': USD or SYP, never auto-cancelled while waiting for the customer.
--  * Customer proves the payment with a ShamCash transaction id (#digits) and/or a receipt image uploaded to a
--    PRIVATE bucket; the same transaction id cannot back two recharges. An admin verifies and approves
--    (existing flow); Telegram alerts the admins.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS shamcash_manual_fallback boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.store_settings.shamcash_manual_fallback IS
  'Show a manual ShamCash transfer option on the recharge page even in Sam API mode (needs shamcash_pay_code).';

ALTER TABLE public.recharge_requests
  ADD COLUMN IF NOT EXISTS payment_txn_ref text,
  ADD COLUMN IF NOT EXISTS payment_proof_path text;

COMMENT ON COLUMN public.recharge_requests.payment_txn_ref IS 'Customer-supplied ShamCash transaction id (#digits) for manual payments.';
COMMENT ON COLUMN public.recharge_requests.payment_proof_path IS 'Path of the uploaded receipt image in the private payment-proofs bucket.';

-- One transaction id can back only one claimed/approved recharge.
CREATE UNIQUE INDEX IF NOT EXISTS recharge_requests_txn_ref_unique
  ON public.recharge_requests (lower(payment_txn_ref))
  WHERE payment_txn_ref IS NOT NULL AND status IN ('payment_sent', 'approved');

-- Private bucket for receipt images: customers write only inside their own folder, admins read everything.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

DROP POLICY IF EXISTS payment_proofs_insert_own ON storage.objects;
CREATE POLICY payment_proofs_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

DROP POLICY IF EXISTS payment_proofs_select_own_or_admin ON storage.objects;
CREATE POLICY payment_proofs_select_own_or_admin ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND ((storage.foldername(name))[1] = (SELECT auth.uid())::text OR public.is_admin())
  );

CREATE OR REPLACE FUNCTION public.get_payment_methods()
 RETURNS json
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'shamcashManualFallback', COALESCE((
        SELECT shamcash_manual_fallback
          AND shamcash_pay_code IS NOT NULL
          AND length(trim(shamcash_pay_code)) > 0
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
$function$;

CREATE OR REPLACE FUNCTION public.create_recharge_request(p_amount numeric, p_payment_method text DEFAULT 'ShamCash'::text, p_pay_currency text DEFAULT 'USD'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_method NOT IN ('ShamCash', 'SyriatelCash', 'ShamCashManual') THEN
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

  IF v_wallet_mode <> 'api' AND v_pay_currency = 'SYP' AND v_method <> 'ShamCashManual' THEN
    RAISE EXCEPTION 'SYP recharge is only available in Sam API mode';
  END IF;

  IF v_pay_currency = 'SYP' AND (v_syp_rate IS NULL OR v_syp_rate <= 0) THEN
    RAISE EXCEPTION 'SYP exchange rate is not configured';
  END IF;

  IF v_method = 'ShamCashManual' THEN
    -- Manual fallback: works in any wallet mode, needs the admin toggle + a wallet id.
    SELECT COALESCE((
        SELECT shamcash_manual_fallback
          AND shamcash_pay_code IS NOT NULL
          AND length(trim(shamcash_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
    IF NOT v_method_ready THEN
      RAISE EXCEPTION 'Manual ShamCash transfer is not enabled';
    END IF;
  ELSIF v_wallet_mode = 'api' THEN
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
$function$;

DROP FUNCTION IF EXISTS public.mark_recharge_payment_sent(uuid);

CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(
  p_request_id uuid,
  p_txn_ref text DEFAULT NULL,
  p_proof_path text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
  v_wallet_mode text;
  v_txn text := nullif(trim(COALESCE(p_txn_ref, '')), '');
  v_proof text := nullif(trim(COALESCE(p_proof_path, '')), '');
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_wallet_mode = 'api' AND v_row.payment_method IS DISTINCT FROM 'ShamCashManual' THEN
    RAISE EXCEPTION 'Manual payment confirmation is not used in Sam API wallet mode';
  END IF;

  -- Proof of payment: ShamCash transaction id (#digits) and/or a receipt image uploaded to our private bucket.
  IF v_txn IS NOT NULL AND v_txn !~ '^#[0-9]{3,20}$' THEN
    RAISE EXCEPTION 'invalid_txn_ref';
  END IF;
  IF v_proof IS NOT NULL THEN
    IF left(v_proof, length(v_user_id::text) + 1) <> v_user_id::text || '/' OR length(v_proof) > 200 THEN
      RAISE EXCEPTION 'invalid_proof_path';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'payment-proofs' AND o.name = v_proof) THEN
      RAISE EXCEPTION 'proof_not_found';
    END IF;
  END IF;
  IF v_row.payment_method = 'ShamCashManual'
     AND v_txn IS NULL AND v_proof IS NULL
     AND v_row.payment_txn_ref IS NULL AND v_row.payment_proof_path IS NULL THEN
    RAISE EXCEPTION 'proof_required';
  END IF;
  IF v_txn IS NOT NULL AND EXISTS (
    SELECT 1 FROM recharge_requests x
    WHERE lower(x.payment_txn_ref) = lower(v_txn)
      AND x.id <> p_request_id
      AND x.status IN ('payment_sent', 'approved')
  ) THEN
    RAISE EXCEPTION 'txn_ref_used';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'This recharge request can no longer be updated';
  END IF;

  BEGIN
    UPDATE recharge_requests
      SET status = 'payment_sent',
          payment_txn_ref = COALESCE(v_txn, payment_txn_ref),
          payment_proof_path = COALESCE(v_proof, payment_proof_path),
          updated_at = now()
      WHERE id = p_request_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'txn_ref_used';
  END;

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'currentBalance', v_current_balance
    ),
    '/recharge'
  );

  PERFORM public.notify_all_admins(
    'admin_recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'userName', COALESCE(v_user_name, 'Customer')
    ),
    '/dashboard'
  );

  PERFORM public.append_site_log(
    'recharge',
    'payment_sent',
    'warning',
    v_user_id,
    v_row.user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'paymentMethod', v_row.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_recharge_payment_sent(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mark_recharge_payment_sent(uuid, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.expire_stale_pending_recharges(p_max_age_minutes integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_minutes int := GREATEST(10, LEAST(COALESCE(p_max_age_minutes, 20), 1440));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_uid uuid := auth.uid();
  -- Non-admins may only clean up their OWN stale recharges (never other users').
  v_own_only boolean := v_uid IS NOT NULL AND NOT public.is_admin();
BEGIN

  -- 1) pending/payment_sent with expired Sam invoice
  WITH expired_inv AS (
    SELECT DISTINCT r.id
    FROM public.recharge_requests r
    JOIN public.sam_invoices si
      ON si.entity_type = 'recharge'
     AND si.entity_id = r.id
    WHERE r.status IN ('pending', 'payment_sent')
      AND (NOT v_own_only OR r.user_id = v_uid)
      AND (
        COALESCE(si.status, '') IN ('expired', 'failed', 'cancelled')
        OR (si.expires_at IS NOT NULL AND si.expires_at <= now())
      )
  ),
  upd AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    FROM expired_inv e
    WHERE r.id = e.id
      AND r.status IN ('pending', 'payment_sent')
    RETURNING r.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM upd;

  v_cancelled := coalesce(array_length(v_ids, 1), 0);

  -- 2) Abandoned pending without a paid path — older than cutoff
  WITH stale AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    WHERE r.status = 'pending'
      AND (NOT v_own_only OR r.user_id = v_uid)
      AND r.created_at < v_cutoff
      AND r.payment_method IS DISTINCT FROM 'ShamCashManual'
      AND r.id <> ALL (v_ids)
    RETURNING r.id
  )
  SELECT v_cancelled + coalesce((SELECT count(*)::int FROM stale), 0)
  INTO v_cancelled;

  -- Mark open Sam invoices as expired for cancelled recharges (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'recharge'
      AND si.entity_id IN (
        SELECT id FROM public.recharge_requests
        WHERE status = 'cancelled'
          AND (NOT v_own_only OR user_id = v_uid)
          AND updated_at > now() - interval '2 minutes'
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled', 'expired');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_admin_recharge_requests(p_status text DEFAULT 'all'::text, p_limit integer DEFAULT 25, p_offset integer DEFAULT 0)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_status text := lower(trim(COALESCE(p_status, 'all')));
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_total bigint := 0;
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status = '' THEN
    v_status := 'all';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.recharge_requests r
  WHERE (v_status = 'all' OR r.status = v_status);

  SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      r.id,
      r.user_id,
      r.amount,
      r.reference,
      r.status,
      r.payment_method,
      r.admin_note,
      r.created_at,
      r.updated_at,
      r.reviewed_at,
      r.reviewed_by,
      r.pay_currency,
      r.syp_per_usd_snapshot,
      r.payment_txn_ref,
      r.payment_proof_path,
      r.credited_amount,
      p.name AS user_name,
      p.username AS username,
      p.balance AS user_balance,
      u.email AS user_email,
      tx.balance_after,
      CASE
        WHEN tx.balance_after IS NOT NULL AND r.amount IS NOT NULL
          THEN (tx.balance_after - r.amount)
        ELSE NULL
      END AS balance_before,
      tx.created_at AS credited_at,
      inv.sam_invoice_id,
      inv.sam_invoice_status,
      inv.sam_invoice_expires_at
    FROM public.recharge_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN LATERAL (
      SELECT
        t.balance_after,
        t.created_at
      FROM public.transactions t
      WHERE t.user_id = r.user_id
        AND t.type IN ('recharge', 'adjustment')
        AND (
          (r.reference IS NOT NULL AND t.reference = r.reference)
          OR (
            r.status = 'approved'
            AND t.created_at BETWEEN r.created_at - interval '1 minute'
              AND COALESCE(r.reviewed_at, r.updated_at, r.created_at) + interval '10 minutes'
            AND t.amount > 0
          )
        )
      ORDER BY
        CASE WHEN r.reference IS NOT NULL AND t.reference = r.reference THEN 0 ELSE 1 END,
        t.created_at DESC
      LIMIT 1
    ) tx ON true
    LEFT JOIN LATERAL (
      SELECT
        si.sam_invoice_id,
        si.status AS sam_invoice_status,
        si.expires_at AS sam_invoice_expires_at
      FROM public.sam_invoices si
      WHERE si.entity_type = 'recharge'
        AND si.entity_id = r.id
      ORDER BY si.created_at DESC
      LIMIT 1
    ) inv ON true
    WHERE (v_status = 'all' OR r.status = v_status)
    ORDER BY r.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN json_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_alert_message(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
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
    WHEN 'rechargePending' THEN
        '🟡 <b>Manual recharge awaiting approval</b>' || E'\n'
      || 'Amount: <b>$' || public.telegram_escape(p_metadata->>'amount') || '</b>'
      || COALESCE(' (' || public.telegram_escape(nullif(p_metadata->>'sypAmount', '')) || ' SYP)', '') || E'\n'
      || 'Method: ' || public.telegram_escape(p_metadata->>'paymentMethod') || E'\n'
      || 'Reference: <code>' || public.telegram_escape(p_metadata->>'reference') || '</code>' || E'\n'
      || COALESCE('Transaction id: <code>' || public.telegram_escape(nullif(p_metadata->>'txnRef', '')) || '</code>' || E'\n', '')
      || CASE WHEN p_metadata->>'hasReceipt' = 'true' THEN 'Receipt image: attached (open the dashboard)' || E'\n' ELSE '' END
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName') || E'\n'
      || 'Verify the transfer in ShamCash, then approve.'
    WHEN 'test' THEN
        '✅ <b>ECHOCORE Telegram alerts — test message</b>' || E'\n'
      || 'If you can read this, alerts are working.'
    ELSE
      NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_alert_link(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT CASE p_type
    WHEN 'orderPaid' THEN
      'https://www.echocore412.com/dashboard/orders?order=' || public.telegram_escape(p_metadata->>'orderId')
    WHEN 'fulfillmentFail' THEN
      'https://www.echocore412.com/dashboard/orders?order=' || public.telegram_escape(p_metadata->>'orderId')
    WHEN 'rechargePending' THEN
      'https://www.echocore412.com/dashboard/recharges'
    WHEN 'recharge' THEN
      'https://www.echocore412.com/dashboard/recharges'
    WHEN 'contact' THEN
      'https://www.echocore412.com/dashboard/contact'
    WHEN 'review' THEN
      'https://www.echocore412.com/dashboard/reviews'
    WHEN 'signup' THEN
      'https://www.echocore412.com/dashboard/users/' || public.telegram_escape(p_metadata->>'username')
    WHEN 'lowWallet' THEN
      'https://www.echocore412.com/dashboard/apis/g2bulk'
    WHEN 'invariantViolation' THEN
      'https://www.echocore412.com/dashboard/orders'
    WHEN 'stuckFulfillment' THEN
      'https://www.echocore412.com/dashboard/orders?status=fulfilling'
    WHEN 'recentFailures' THEN
      'https://www.echocore412.com/dashboard/orders?status=failed'
    ELSE
      NULL
  END;
$function$;

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
  IF p_type = 'rechargePending' THEN
    -- Opens the pending list in the bot (admin reviews, then approves/rejects there).
    v_rows := v_rows || jsonb_build_array(jsonb_build_array(
      jsonb_build_object('text', '📋 Review pending', 'callback_data', 'admin_pending')
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

-- Telegram alert for every claimed manual payment (payment_sent). Never blocks the status change.
CREATE OR REPLACE FUNCTION public.on_recharge_payment_sent_admin_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
BEGIN
  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles WHERE id = NEW.user_id;

  PERFORM public.notify_admin_telegram(
    'rechargePending',
    jsonb_build_object(
      'requestId', NEW.id,
      'amount', NEW.amount,
      'paymentMethod', NEW.payment_method,
      'reference', NEW.reference,
      'txnRef', NEW.payment_txn_ref,
      'hasReceipt', (NEW.payment_proof_path IS NOT NULL)::text,
      'sypAmount', CASE
        WHEN upper(COALESCE(NEW.pay_currency, 'USD')) = 'SYP' AND NEW.syp_per_usd_snapshot IS NOT NULL
          THEN to_char(round(NEW.amount * NEW.syp_per_usd_snapshot), 'FM999,999,999,990')
        ELSE NULL
      END,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.on_recharge_payment_sent_admin_alert() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS recharge_payment_sent_admin_alert ON public.recharge_requests;
CREATE TRIGGER recharge_payment_sent_admin_alert
  AFTER UPDATE OF status ON public.recharge_requests
  FOR EACH ROW
  WHEN (NEW.status = 'payment_sent' AND OLD.status IS DISTINCT FROM 'payment_sent')
  EXECUTE FUNCTION public.on_recharge_payment_sent_admin_alert();
