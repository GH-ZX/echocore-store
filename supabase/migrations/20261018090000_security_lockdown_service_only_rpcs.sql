-- Security lockdown (2026-10-18)
--
-- The 20260921 linter sweep granted EXECUTE on every SECURITY DEFINER function
-- to `authenticated`. That exposed service-only internals to any logged-in
-- customer via POST /rest/v1/rpc/<name>, e.g. completing an unpaid Sam invoice
-- (free order / minted balance), forging fulfillment status, broadcasting
-- notifications, reading all recharge history, overwriting other users'
-- saved player UIDs, and purging logs.
--
-- None of these are called by the browser (verified by grep of src/); they are
-- called only by edge functions with the service-role client, or by other
-- SECURITY DEFINER functions (which run as the owner and are unaffected).
--
-- Revert: supabase/migrations/revert/20261018090000_revert_security_lockdown.sql
-- Pre-change snapshot of every public function: echocore_backup.function_snapshots
--   (label = '2026-10-18-security-lockdown').

-- 1) Service-only functions: no client role may execute them.
DO $$
DECLARE
  f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'complete_order_from_sam_invoice',
        'complete_recharge_from_sam_invoice',
        'cancel_order_from_sam_invoice',
        'cancel_recharge_from_sam_invoice',
        'complete_recharge_from_binance_pay_order',
        'apply_g2bulk_fulfillment',
        'acquire_order_fulfillment_lock',
        'release_order_fulfillment_lock',
        'notify_user',
        'notify_all_users',
        'notify_all_admins',
        'notify_admin_telegram',
        'list_admin_recharge_history_rows',
        'list_admin_recharge_history',
        'upsert_profile_game_player_uid',
        'purge_old_site_logs',
        'mark_user_verified_after_recharge',
        'pay_influencer_commission_for_order',
        'append_site_log',
        'try_append_site_log',
        'check_fulfillment_invariants',
        'deduct_user_balance'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig);
  END LOOP;
END $$;

-- 2) Defense in depth: Sam completion only for invoices already marked paid.
--    Every edge-function path (webhook, verifyPayment, getInvoiceStatus) writes
--    status='paid' before calling these.
CREATE OR REPLACE FUNCTION public.complete_order_from_sam_invoice(p_sam_invoice_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ref text;
  v_user_name text;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Invoice is not paid';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'order' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_an_order');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object(
      'orderId', v_order.id,
      'status', 'completed',
      'skipped', true
    );
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_order.payment_reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.orders
  SET
    status = 'completed',
    payment_reference = COALESCE(nullif(trim(payment_reference), ''), v_ref)
  WHERE id = v_order.id;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  SELECT
    v_order.user_id,
    'purchase',
    -v_order.total,
    p.balance,
    v_order.payment_method,
    v_ref,
    'completed'
  FROM public.profiles p
  WHERE p.id = v_order.user_id;

  SELECT COALESCE(name, 'Customer') INTO v_user_name FROM public.profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_completed',
    jsonb_build_object(
      'orderId', v_order.id,
      'total', v_order.total
    ),
    '/success?orderId=' || v_order.id::text
  );

  PERFORM public.append_site_log(
    'order',
    'sam_paid',
    'success',
    NULL,
    v_order.user_id,
    jsonb_build_object(
      'orderId', v_order.id,
      'total', v_order.total,
      'reference', v_ref,
      'paymentMethod', v_order.payment_method,
      'samInvoiceId', p_sam_invoice_id,
      'userName', v_user_name
    )
  );

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', 'completed'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_recharge_from_sam_invoice(p_sam_invoice_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  IF v_inv.status IS DISTINCT FROM 'paid' THEN
    RAISE EXCEPTION 'Invoice is not paid';
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
$function$;

-- 3) Customers editing their own row: also freeze ban + verification state,
--    and only allow clearing (not setting) the Telegram link. Admin and
--    service-role paths are unchanged (early returns above the freeze).
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  caller_role text;
BEGIN
  -- Trusted RPCs set this for legitimate balance changes
  IF current_setting('echocore.allow_balance_change', true) IN ('1', 'true') THEN
    RETURN NEW;
  END IF;

  -- service_role / no JWT (backend only) — leave alone
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  -- Customer editing own profile: freeze money + role + username + pricing
  -- entitlements. partner_tier_id grants near-cost supplier pricing in
  -- create_order_atomic, and dev_test_balance is mock money — a customer must
  -- never be able to self-assign either via REST PATCH.
  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
    NEW.username := OLD.username;
    NEW.partner_tier_id := OLD.partner_tier_id;
    NEW.dev_test_balance := OLD.dev_test_balance;
    -- Ban + verification are admin/system decisions (self-unban, skip verify gate).
    NEW.banned_at := OLD.banned_at;
    NEW.ban_expires_at := OLD.ban_expires_at;
    NEW.ban_reason := OLD.ban_reason;
    NEW.banned_by := OLD.banned_by;
    NEW.verified_at := OLD.verified_at;
    -- Telegram link is set only by the bot (service role); a customer may unlink.
    IF NEW.telegram_chat_id IS NOT NULL
       AND NEW.telegram_chat_id IS DISTINCT FROM OLD.telegram_chat_id THEN
      NEW.telegram_chat_id := OLD.telegram_chat_id;
      NEW.telegram_linked_at := OLD.telegram_linked_at;
    END IF;
    IF TG_OP = 'UPDATE' THEN
      -- never let client set another user's id
      NEW.id := OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

-- 4) Never auto-cancel orders the customer reports as paid (manual ShamCash /
--    Syriatel awaiting admin review). Only abandoned `pending_payment` expire.
CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(p_max_age_minutes integer DEFAULT 15)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_minutes int := GREATEST(5, LEAST(COALESCE(p_max_age_minutes, 15), 120));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_fulfill_failed int := 0;
BEGIN
  -- Only admins or service role (edge) may run cleanup.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1) Unpaid / abandoned checkout attempts
  UPDATE public.orders
  SET
    status = 'cancelled',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'pending_over_15_minutes'
    )
  WHERE status = 'pending_payment'
    AND created_at < v_cutoff;

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Cancel related open Sam invoices for those orders (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'order'
      AND si.entity_id IN (
        SELECT id FROM public.orders
        WHERE status = 'cancelled'
          AND COALESCE((g2bulk_metadata->>'auto_expired')::boolean, false) = true
          AND g2bulk_metadata->>'auto_expire_reason' = 'pending_over_15_minutes'
          AND created_at < v_cutoff
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  -- 2) Stuck "fulfilling" orders: keep them fulfilling, only note the stale supplier
  UPDATE public.orders
  SET
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'last_error', 'Fulfillment still processing at supplier (auto-noted after 15 minutes)',
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'fulfillment_stuck_fulfilling'
    )
  WHERE status = 'completed'
    AND fulfillment_status = 'fulfilling'
    AND COALESCE(updated_at, created_at) < v_cutoff;

  GET DIAGNOSTICS v_fulfill_failed = ROW_COUNT;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'notedStuckFulfillment', v_fulfill_failed,
    'failedStuckFulfillment', 0,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$function$;
