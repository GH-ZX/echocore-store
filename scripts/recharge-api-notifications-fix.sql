-- Skip admin recharge notifications when Sam API wallet mode is active (manual approval off).
-- Run: supabase db query --linked -f scripts/recharge-api-notifications-fix.sql

CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
  v_wallet_mode text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode = 'api' THEN
    RAISE EXCEPTION 'Manual payment confirmation is not used in Sam API wallet mode';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'This recharge request can no longer be updated';
  END IF;

  UPDATE recharge_requests
    SET status = 'payment_sent', updated_at = now()
    WHERE id = p_request_id;

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

  IF v_wallet_mode = 'manual' THEN
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
  END IF;

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;

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
      'amount', v_row.amount,
      'newBalance', v_new_balance,
      'status', 'approved',
      'skipped', true
    );
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Recharge request is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_row.amount
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_row.amount, v_new_balance, v_row.payment_method, v_ref, 'completed');

  UPDATE public.recharge_requests
  SET
    status = 'approved',
    reviewed_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id,
      'amount', v_row.amount,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  -- Sam API recharges auto-credit balance — no admin approval or admin inbox noise.

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_recharge_from_sam_invoice(text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_recharge_from_sam_invoice(text) TO service_role;