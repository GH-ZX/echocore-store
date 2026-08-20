-- Allow admin debit to push customer balance below zero.
-- Previously: debit was blocked if amount > current balance, and GREATEST(0,...) clamped to 0.
-- Now: admin can debit any amount up to ADJUST_MAX; balance may go negative.

CREATE OR REPLACE FUNCTION public.admin_adjust_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_direction text, -- 'credit' | 'debit'
  p_reason text,
  p_transaction_ref text DEFAULT NULL,
  p_force_zero boolean DEFAULT false -- true: zero the full balance (ignores p_amount)
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
  v_old_balance numeric;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_tx_ref text := trim(COALESCE(p_transaction_ref, ''));
  v_dir text := lower(trim(COALESCE(p_direction, 'credit')));
  v_delta numeric;
  v_removed numeric;
  v_reference text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  IF v_dir NOT IN ('credit', 'debit') THEN
    RAISE EXCEPTION 'Direction must be credit or debit';
  END IF;

  IF NOT p_force_zero THEN
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
      RAISE EXCEPTION 'Amount must be between $0.01 and $500';
    END IF;

    -- Allow cents
    IF round(p_amount, 2) <> p_amount THEN
      RAISE EXCEPTION 'Amount may have at most 2 decimal places';
    END IF;
  END IF;

  IF v_reason <> '' AND length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters when provided';
  END IF;

  IF v_tx_ref <> '' AND v_tx_ref !~ '^#[0-9]+' THEN
    RAISE EXCEPTION 'Transaction reference must start with # followed by digits only';
  END IF;

  SELECT COALESCE(name, username, 'Customer'), COALESCE(balance, 0)
  INTO v_user_name, v_old_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT COALESCE(name, username, 'Admin') INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  IF p_force_zero THEN
    v_removed := v_old_balance;
    v_dir := 'debit';
    v_delta := -v_old_balance;
  ELSE
    v_removed := p_amount;
    v_delta := CASE WHEN v_dir = 'debit' THEN -p_amount ELSE p_amount END;

    -- NOTE: removed insufficient-balance guard — admin can now push balance negative
  END IF;

  -- Allow admin balance writes
  PERFORM set_config('echocore.allow_balance_change', '1', true);

  -- No more GREATEST(0, ...) — allow negative balances
  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_delta
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  v_reference := COALESCE(
    NULLIF(v_tx_ref, ''),
    upper(v_dir) || '-' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  ) VALUES (
    p_user_id,
    'adjustment', -- signed amount: +credit / -debit (allowed by transactions_type_check)
    v_delta,
    v_new_balance,
    'admin_manual',
    v_reference,
    'completed'
  );

  PERFORM public.notify_user(
    p_user_id,
    CASE WHEN v_dir = 'debit' THEN 'admin_balance_debit' ELSE 'recharge_approved' END,
    jsonb_build_object(
      'amount', v_removed,
      'direction', v_dir,
      'newBalance', v_new_balance,
      'manualCredit', v_dir = 'credit',
      'manualDebit', v_dir = 'debit',
      'zeroed', p_force_zero,
      'reason', v_reason
    ),
    '/profile'
  );

  BEGIN
    PERFORM public.append_site_log(
      'recharge',
      CASE WHEN v_dir = 'debit' THEN 'manual_debit' ELSE 'manual_credit' END,
      'success',
      v_admin_id,
      p_user_id,
      jsonb_build_object(
        'amount', v_removed,
        'delta', v_delta,
        'oldBalance', v_old_balance,
        'newBalance', v_new_balance,
        'reason', v_reason,
        'transactionRef', NULLIF(v_tx_ref, ''),
        'reference', v_reference,
        'userName', v_user_name,
        'adminName', v_admin_name,
        'direction', v_dir,
        'zeroed', p_force_zero
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'userName', v_user_name,
    'amount', v_removed,
    'direction', v_dir,
    'delta', v_delta,
    'oldBalance', v_old_balance,
    'newBalance', v_new_balance,
    'reference', v_reference,
    'status', CASE WHEN v_dir = 'debit' THEN 'debited' ELSE 'credited' END,
    'zeroed', p_force_zero
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_user_balance(uuid, numeric, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_balance(uuid, numeric, text, text, text, boolean) TO authenticated;
