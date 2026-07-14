-- =============================================================================
-- Admin manual balance credit — recover failed/expired ShamCash recharges
-- Apply: supabase db query --linked -f scripts/admin-manual-balance-credit-migration.sql
-- Requires: site-logs-migration.sql (append_site_log)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_manual_balance_credit(
  p_user_id uuid,
  p_amount numeric,
  p_reason text,
  p_transaction_ref text DEFAULT NULL,
  p_recharge_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_user_name text;
  v_admin_name text;
  v_new_balance numeric;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_tx_ref text := trim(COALESCE(p_transaction_ref, ''));
  v_req recharge_requests%ROWTYPE;
  v_reference text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $1 and $500';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason is required (at least 5 characters)';
  END IF;

  IF v_tx_ref <> '' AND v_tx_ref !~ '^#[0-9]+$' THEN
    RAISE EXCEPTION 'Transaction reference must start with # followed by digits only (e.g. #324065688)';
  END IF;

  SELECT COALESCE(name, 'Customer') INTO v_user_name
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_user_name IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT COALESCE(name, 'Admin') INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  IF p_recharge_request_id IS NOT NULL THEN
    SELECT * INTO v_req
    FROM public.recharge_requests
    WHERE id = p_recharge_request_id
    FOR UPDATE;

    IF v_req.id IS NULL THEN
      RAISE EXCEPTION 'Recharge request not found';
    END IF;

    IF v_req.user_id IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'Recharge request does not belong to this user';
    END IF;

    IF v_req.status = 'approved' THEN
      RAISE EXCEPTION 'This recharge request is already approved';
    END IF;
  END IF;

  v_reference := COALESCE(
    NULLIF(v_tx_ref, ''),
    CASE WHEN p_recharge_request_id IS NOT NULL THEN v_req.reference ELSE NULL END,
    'MANUAL-' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + p_amount
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  INSERT INTO public.transactions (
    user_id,
    type,
    amount,
    balance_after,
    payment_method,
    reference,
    status
  )
  VALUES (
    p_user_id,
    'adjustment',
    p_amount,
    v_new_balance,
    'admin_manual',
    v_reference,
    'completed'
  );

  IF p_recharge_request_id IS NOT NULL THEN
    UPDATE public.recharge_requests
    SET
      status = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      admin_note = v_reason,
      updated_at = now()
    WHERE id = p_recharge_request_id;
  END IF;

  PERFORM public.notify_user(
    p_user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', p_recharge_request_id,
      'amount', p_amount,
      'newBalance', v_new_balance,
      'manualCredit', true,
      'reason', v_reason
    ),
    '/profile'
  );

  PERFORM public.append_site_log(
    'recharge',
    'manual_credit',
    'success',
    v_admin_id,
    p_user_id,
    jsonb_build_object(
      'amount', p_amount,
      'newBalance', v_new_balance,
      'reason', v_reason,
      'transactionRef', NULLIF(v_tx_ref, ''),
      'requestId', p_recharge_request_id,
      'reference', v_reference,
      'userName', v_user_name,
      'adminName', v_admin_name,
      'paymentMethod', COALESCE(v_req.payment_method, 'ShamCash')
    )
  );

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'userName', v_user_name,
    'amount', p_amount,
    'newBalance', v_new_balance,
    'reference', v_reference,
    'requestId', p_recharge_request_id,
    'status', 'credited'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_manual_balance_credit(uuid, numeric, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_manual_balance_credit(uuid, numeric, text, text, uuid) TO authenticated;