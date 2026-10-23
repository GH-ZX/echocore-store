-- Telegram recharge review by "approvers" (people in the alert chats): record WHO acted.
-- The reviewer column still points at an admin profile; the actual Telegram person goes into the site log.
-- New optional argument p_actor; the old 2-argument functions are replaced (callers keep working via the default).

DROP FUNCTION IF EXISTS public.telegram_approve_recharge(uuid, uuid);
DROP FUNCTION IF EXISTS public.telegram_reject_recharge(uuid, uuid);

CREATE OR REPLACE FUNCTION public.telegram_approve_recharge(p_request_id uuid, p_admin_id uuid, p_actor text DEFAULT NULL)
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
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount, 'newBalance', v_new_balance, 'via', 'telegram', 'actor', p_actor));
  RETURN jsonb_build_object('userId', v_row.user_id, 'amount', v_row.amount, 'newBalance', v_new_balance);
END;
$function$;

CREATE OR REPLACE FUNCTION public.telegram_reject_recharge(p_request_id uuid, p_admin_id uuid, p_actor text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM recharge_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recharge request not found'; END IF;
  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting review';
  END IF;

  UPDATE recharge_requests
    SET status = 'rejected', reviewed_by = p_admin_id, reviewed_at = now(), updated_at = now()
    WHERE id = p_request_id;

  PERFORM public.notify_user(
    v_row.user_id, 'recharge_rejected',
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount),
    '/recharge'
  );

  PERFORM public.append_site_log(
    'recharge', 'rejected', 'danger', p_admin_id, v_row.user_id,
    jsonb_build_object('requestId', p_request_id, 'amount', v_row.amount, 'via', 'telegram', 'actor', p_actor)
  );

  RETURN jsonb_build_object('userId', v_row.user_id, 'amount', v_row.amount);
END;
$function$;

-- Service-role only (the bot), like before.
REVOKE ALL ON FUNCTION public.telegram_approve_recharge(uuid, uuid, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.telegram_reject_recharge(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_approve_recharge(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.telegram_reject_recharge(uuid, uuid, text) TO service_role;
