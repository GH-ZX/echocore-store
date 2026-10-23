-- Manual ShamCash: don't silently block a second claimant of the same transaction id.
--  * Duplicate claims are ACCEPTED but flagged to the admin (list flag + Telegram warning), so a squatted id can
--    never lock out an honest customer, and the admin decides after checking ShamCash.
--  * The money rule is now enforced at approval: one transaction id can be credited ONCE
--    (explicit check in both approve paths + unique index on approved rows).
--  * Every manual claim is written to the site log (who / which id / receipt).

DROP INDEX IF EXISTS public.recharge_requests_txn_ref_unique;
CREATE UNIQUE INDEX IF NOT EXISTS recharge_requests_txn_ref_approved_unique
  ON public.recharge_requests (lower(payment_txn_ref))
  WHERE payment_txn_ref IS NOT NULL AND status = 'approved';

CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(p_request_id uuid, p_txn_ref text DEFAULT NULL::text, p_proof_path text DEFAULT NULL::text)
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

  -- Audit trail of every manual claim (who, which transaction id, receipt or not).
  PERFORM public.try_append_site_log(
    'recharge', 'manual_payment_claim', 'info', v_user_id, v_user_id,
    jsonb_build_object('requestId', p_request_id, 'txnRef', COALESCE(v_txn, v_row.payment_txn_ref),
                       'hasReceipt', (COALESCE(v_proof, v_row.payment_proof_path) IS NOT NULL),
                       'paymentMethod', v_row.payment_method)
  );

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

CREATE OR REPLACE FUNCTION public.approve_recharge_request(p_request_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_user_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting approval';
  END IF;

  -- One approval per ShamCash transaction id: the same transfer can never be credited twice.
  IF v_row.payment_txn_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.recharge_requests x
    WHERE lower(x.payment_txn_ref) = lower(v_row.payment_txn_ref)
      AND x.id <> v_row.id
      AND x.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'txn_ref_already_approved';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_row.user_id,
    v_row.amount,
    v_row.payment_method,
    v_row.reference
  );

  UPDATE recharge_requests
    SET status = 'approved',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  PERFORM public.append_site_log(
    'recharge',
    'approved',
    'success',
    v_admin_id,
    v_row.user_id,
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'newBalance', v_new_balance,
      'paymentMethod', v_row.payment_method,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_approve_recharge(p_request_id uuid, p_admin_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row recharge_requests%ROWTYPE;
  v_new_balance numeric;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_row FROM recharge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge request not found'; END IF;
  IF v_row.status NOT IN ('pending', 'payment_sent') THEN RAISE EXCEPTION 'Request is not awaiting approval'; END IF;

  -- One approval per ShamCash transaction id: the same transfer can never be credited twice.
  IF v_row.payment_txn_ref IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.recharge_requests x
    WHERE lower(x.payment_txn_ref) = lower(v_row.payment_txn_ref)
      AND x.id <> v_row.id
      AND x.status = 'approved'
  ) THEN
    RAISE EXCEPTION 'txn_ref_already_approved';
  END IF;
  IF v_row.amount IS NULL OR v_row.amount <= 0 THEN RAISE EXCEPTION 'Amount must be positive'; END IF;
  PERFORM set_config('echocore.allow_balance_change', '1', true);
  UPDATE public.profiles SET balance = COALESCE(balance, 0) + v_row.amount WHERE id = v_row.user_id RETURNING balance INTO v_new_balance;
  IF v_new_balance IS NULL THEN RAISE EXCEPTION 'Profile not found'; END IF;
  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_row.amount, v_new_balance, v_row.payment_method, v_row.reference, 'completed');
  UPDATE recharge_requests SET status = 'approved', credited_amount = v_row.amount, reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now() WHERE id = p_request_id;
  PERFORM public.notify_user(v_row.user_id, 'recharge_approved',
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount, 'newBalance', v_new_balance), '/profile');
  PERFORM public.append_site_log('recharge', 'approved', 'success', p_admin_id, v_row.user_id,
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount, 'newBalance', v_new_balance, 'via', 'telegram'));
  RETURN jsonb_build_object('userId', v_row.user_id, 'amount', v_row.amount, 'newBalance', v_new_balance);
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
      (
        r.payment_txn_ref IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.recharge_requests o
          WHERE lower(o.payment_txn_ref) = lower(r.payment_txn_ref)
            AND o.id <> r.id
            AND o.status IN ('payment_sent', 'approved')
        )
      ) AS txn_ref_conflict,
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
      || CASE WHEN p_metadata->>'txnConflict' = 'true' THEN '⚠️ <b>This transaction id was also claimed by another request — verify carefully.</b>' || E'\n' ELSE '' END
      || CASE WHEN p_metadata->>'hasReceipt' = 'true' THEN 'Receipt image: attached (open the dashboard)' || E'\n' ELSE '' END
      || 'Customer: ' || public.telegram_escape(p_metadata->>'userName') || E'\n'
      || 'Check in ShamCash: the amount, the sender, and that the transfer note contains the reference above.'
    WHEN 'test' THEN
        '✅ <b>ECHOCORE Telegram alerts — test message</b>' || E'\n'
      || 'If you can read this, alerts are working.'
    ELSE
      NULL
  END;
$function$;

CREATE OR REPLACE FUNCTION public.on_recharge_payment_sent_admin_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_conflict boolean := false;
BEGIN
  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles WHERE id = NEW.user_id;

  IF NEW.payment_txn_ref IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.recharge_requests o
      WHERE lower(o.payment_txn_ref) = lower(NEW.payment_txn_ref)
        AND o.id <> NEW.id
        AND o.status IN ('payment_sent', 'approved')
    ) INTO v_conflict;
  END IF;

  PERFORM public.notify_admin_telegram(
    'rechargePending',
    jsonb_build_object(
      'requestId', NEW.id,
      'amount', NEW.amount,
      'paymentMethod', NEW.payment_method,
      'reference', NEW.reference,
      'txnRef', NEW.payment_txn_ref,
      'txnConflict', v_conflict::text,
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
