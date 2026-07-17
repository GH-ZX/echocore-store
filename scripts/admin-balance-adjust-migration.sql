-- =============================================================================
-- Admin wallet adjust: ADD or DEDUCT customer store balance + edit profile fields
-- Apply: supabase db query --linked -f scripts/admin-balance-adjust-migration.sql
-- =============================================================================

-- Signed adjust: positive = credit, negative = debit (cannot go below 0)
CREATE OR REPLACE FUNCTION public.admin_adjust_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_direction text, -- 'credit' | 'debit'
  p_reason text,
  p_transaction_ref text DEFAULT NULL
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

  IF p_amount IS NULL OR p_amount <= 0 OR p_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $0.01 and $500';
  END IF;

  -- Allow cents
  IF round(p_amount, 2) <> p_amount THEN
    RAISE EXCEPTION 'Amount may have at most 2 decimal places';
  END IF;

  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason is required (at least 5 characters)';
  END IF;

  IF v_tx_ref <> '' AND v_tx_ref !~ '^#[0-9]+$' THEN
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

  v_delta := CASE WHEN v_dir = 'debit' THEN -p_amount ELSE p_amount END;

  IF v_dir = 'debit' AND v_old_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance (current $%)', to_char(v_old_balance, 'FM999990.00');
  END IF;

  -- Allow admin balance writes
  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = GREATEST(0, COALESCE(balance, 0) + v_delta)
  WHERE id = p_user_id
  RETURNING balance INTO v_new_balance;

  v_reference := COALESCE(
    NULLIF(v_tx_ref, ''),
    upper(v_dir) || '-' || to_char(now(), 'YYYYMMDDHH24MISS')
  );

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  )
  VALUES (
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
      'amount', p_amount,
      'direction', v_dir,
      'newBalance', v_new_balance,
      'manualCredit', v_dir = 'credit',
      'manualDebit', v_dir = 'debit',
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
        'amount', p_amount,
        'delta', v_delta,
        'oldBalance', v_old_balance,
        'newBalance', v_new_balance,
        'reason', v_reason,
        'transactionRef', NULLIF(v_tx_ref, ''),
        'reference', v_reference,
        'userName', v_user_name,
        'adminName', v_admin_name,
        'direction', v_dir
      )
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'userName', v_user_name,
    'amount', p_amount,
    'direction', v_dir,
    'delta', v_delta,
    'oldBalance', v_old_balance,
    'newBalance', v_new_balance,
    'reference', v_reference,
    'status', CASE WHEN v_dir = 'debit' THEN 'debited' ELSE 'credited' END
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_adjust_user_balance(uuid, numeric, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_adjust_user_balance(uuid, numeric, text, text, text) TO authenticated;

-- Keep legacy credit RPC working by delegating to adjust
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
  v_result jsonb;
  v_admin_id uuid := auth.uid();
  v_req public.recharge_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Optional link to recharge request (legacy recovery flow)
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

  v_result := public.admin_adjust_user_balance(
    p_user_id,
    p_amount,
    'credit',
    p_reason,
    p_transaction_ref
  );

  IF p_recharge_request_id IS NOT NULL THEN
    UPDATE public.recharge_requests
    SET
      status = 'approved',
      reviewed_by = v_admin_id,
      reviewed_at = now(),
      admin_note = trim(COALESCE(p_reason, '')),
      updated_at = now()
    WHERE id = p_recharge_request_id;

    v_result := v_result || jsonb_build_object('requestId', p_recharge_request_id);
  END IF;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_manual_balance_credit(uuid, numeric, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_manual_balance_credit(uuid, numeric, text, text, uuid) TO authenticated;

-- Admin edit customer profile fields (not role/balance — use adjust for wallet)
CREATE OR REPLACE FUNCTION public.admin_update_user_profile(
  p_user_id uuid,
  p_name text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_bio text DEFAULT NULL,
  p_discord_username text DEFAULT NULL,
  p_favorite_game text DEFAULT NULL,
  p_default_player_uid text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  UPDATE public.profiles
  SET
    name = CASE WHEN p_name IS NULL THEN name ELSE nullif(trim(p_name), '') END,
    phone = CASE WHEN p_phone IS NULL THEN phone ELSE nullif(trim(p_phone), '') END,
    country = CASE WHEN p_country IS NULL THEN country ELSE nullif(trim(p_country), '') END,
    bio = CASE WHEN p_bio IS NULL THEN bio ELSE nullif(trim(p_bio), '') END,
    discord_username = CASE WHEN p_discord_username IS NULL THEN discord_username ELSE nullif(trim(p_discord_username), '') END,
    favorite_game = CASE WHEN p_favorite_game IS NULL THEN favorite_game ELSE nullif(trim(p_favorite_game), '') END,
    default_player_uid = CASE WHEN p_default_player_uid IS NULL THEN default_player_uid ELSE nullif(trim(p_default_player_uid), '') END
  WHERE id = p_user_id
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'phone', v_row.phone,
    'country', v_row.country,
    'bio', v_row.bio,
    'discord_username', v_row.discord_username,
    'favorite_game', v_row.favorite_game,
    'default_player_uid', v_row.default_player_uid,
    'username', v_row.username,
    'balance', v_row.balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text, text, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_user_profile(uuid, text, text, text, text, text, text, text) TO authenticated;
