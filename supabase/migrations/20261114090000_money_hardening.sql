-- Money path hardening (2026-11-14). Written against a schema-only copy of the LIVE database
-- (`supabase db dump`, 2026-11-14), not against supabase_echocore_full.sql.
--
-- 1. Balances move only inside SQL functions. A direct UPDATE of profiles.balance from the
--    REST API (role authenticated / anon / service_role) is refused, admins included. Admins
--    change a balance with admin_adjust_user_balance (the dashboard already does);
--    credit_user_balance now goes through it too.
-- 2. When an order is refunded (g2bulk_metadata.balance_refunded turns true, whichever path
--    did it), the influencer commission paid for it is taken back from the influencer's wallet,
--    with a ledger row. The wallet may go below zero (like an admin debit).
-- 3. Dashboard "refund failed order": admin_refund_failed_order runs the exact guards of the
--    Telegram refund (shared refund_failed_order_internal).
-- 4. Daily check that every wallet equals the sum of its ledger rows, kept in
--    balance_ledger_checks, with an admin notification + Telegram alert when the set of
--    mismatches changes (and a reminder every 7 days while any remain).
--
-- The pre-change bodies of the replaced functions are saved in
-- echocore_backup.function_snapshots (label '2026-11-14-money-hardening').
-- Rollback: supabase/migrations/revert/20261114090000_revert_money_hardening.sql

-- ── 0. Snapshot what this migration replaces ────────────────────────────────────────────────
INSERT INTO echocore_backup.function_snapshots (label, proname, args, definition, authenticated_exec, anon_exec)
SELECT '2026-11-14-money-hardening', p.proname, oidvectortypes(p.proargtypes),
       pg_get_functiondef(p.oid),
       has_function_privilege('authenticated', p.oid, 'EXECUTE'),
       has_function_privilege('anon', p.oid, 'EXECUTE')
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('credit_user_balance', 'telegram_refund_failed_order');

-- ── 1. Balance writes only through SQL functions ────────────────────────────────────────────
-- SECURITY INVOKER on purpose: current_user is the role that ran the UPDATE. SQL functions
-- (SECURITY DEFINER, owned by postgres) run as postgres and pass; PostgREST callers do not.
-- Named zz_ so it runs after protect_profile_sensitive_fields, which already silently undoes a
-- customer's change to their own balance: what is left to refuse here is an admin (or a
-- service-role script) writing the column directly.
CREATE OR REPLACE FUNCTION public.guard_direct_balance_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.balance IS DISTINCT FROM OLD.balance
     AND current_user IN ('authenticated', 'anon', 'service_role') THEN
    RAISE EXCEPTION 'balance_direct_write_blocked: change balances with admin_adjust_user_balance'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_direct_balance_write() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS zz_profiles_balance_via_rpc_only ON public.profiles;
CREATE TRIGGER zz_profiles_balance_via_rpc_only
  BEFORE UPDATE OF balance ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_direct_balance_write();

-- Not used by the site any more, but callable by admins: route it through the audited path
-- (limits, ledger row, notification, site log) instead of its own UPDATE.
CREATE OR REPLACE FUNCTION public.credit_user_balance(p_user_id uuid, p_amount numeric, p_payment_method text, p_reference text DEFAULT NULL::text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  v_result := public.admin_adjust_user_balance(
    p_user_id,
    p_amount,
    'credit',
    left('Credit (' || COALESCE(NULLIF(trim(p_payment_method), ''), 'manual') || ')'
         || COALESCE(' ' || NULLIF(trim(p_reference), ''), ''), 200),
    NULL
  );
  RETURN (v_result->>'newBalance')::numeric;
END;
$$;

-- ── 2. Take the influencer commission back when its order is refunded ───────────────────────
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS influencer_commission_reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS influencer_commission_reversed_usd numeric(12,2);

CREATE OR REPLACE FUNCTION public.reverse_influencer_commission_for_order(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_amount numeric;
  v_influencer uuid;
  v_code text;
  v_ref text;
  v_new_bal numeric;
  v_prev_change text := current_setting('echocore.allow_balance_change', true);
  v_prev_negative text := current_setting('echocore.allow_negative_balance', true);
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR v_order.influencer_commission_reversed_at IS NOT NULL THEN
    RETURN 0;
  END IF;

  v_amount := round(COALESCE(v_order.influencer_commission_usd, 0), 2);
  IF v_order.influencer_commission_paid_at IS NULL OR v_amount < 0.01 THEN
    RETURN 0;
  END IF;

  -- Who was paid: the ledger row pay_influencer_commission_for_order wrote
  -- ('INF-<code>-<first 8 of the order id>'), then the coupon as a fallback.
  SELECT t.user_id, substring(t.reference FROM '^INF-(.*)-[0-9a-f]{8}$')
  INTO v_influencer, v_code
  FROM public.transactions t
  WHERE t.payment_method = 'influencer_commission'
    AND t.type = 'adjustment'
    AND t.amount = v_amount
    AND t.reference LIKE 'INF-%-' || left(p_order_id::text, 8)
  ORDER BY t.created_at
  LIMIT 1;

  IF v_influencer IS NULL AND v_order.influencer_coupon_id IS NOT NULL THEN
    SELECT c.influencer_user_id, c.code INTO v_influencer, v_code
    FROM public.influencer_coupons c
    WHERE c.id = v_order.influencer_coupon_id;
  END IF;

  IF v_influencer IS NULL THEN
    PERFORM public.try_append_site_log(
      'wallet', 'influencer_commission_reversal_skipped', 'warning', v_order.user_id, NULL,
      jsonb_build_object('orderId', p_order_id, 'orderRef', v_order.order_ref, 'amount', v_amount,
                         'reason', 'influencer not found'));
    RETURN 0;
  END IF;

  v_ref := 'INF-REV-' || COALESCE(v_order.order_ref, left(p_order_id::text, 8));
  IF EXISTS (SELECT 1 FROM public.transactions
             WHERE payment_method = 'influencer_commission_reversal' AND reference = v_ref) THEN
    UPDATE public.orders
    SET influencer_commission_reversed_at = now(), influencer_commission_reversed_usd = v_amount
    WHERE id = p_order_id;
    RETURN 0;
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);
  PERFORM set_config('echocore.allow_negative_balance', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) - v_amount
  WHERE id = v_influencer
  RETURNING balance INTO v_new_bal;

  PERFORM set_config('echocore.allow_balance_change', COALESCE(v_prev_change, ''), true);
  PERFORM set_config('echocore.allow_negative_balance', COALESCE(v_prev_negative, ''), true);

  IF v_new_bal IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_influencer, 'adjustment', -v_amount, v_new_bal, 'influencer_commission_reversal', v_ref, 'completed');

  UPDATE public.orders
  SET influencer_commission_reversed_at = now(),
      influencer_commission_reversed_usd = v_amount
  WHERE id = p_order_id;

  IF v_order.influencer_coupon_id IS NOT NULL THEN
    UPDATE public.influencer_coupons
    SET redemption_count = GREATEST(0, COALESCE(redemption_count, 0) - 1), updated_at = now()
    WHERE id = v_order.influencer_coupon_id;
  END IF;

  PERFORM public.notify_user(
    v_influencer,
    'influencer_commission_reversed',
    jsonb_build_object('amount', v_amount, 'code', v_code, 'orderId', p_order_id,
                       'orderRef', v_order.order_ref, 'newBalance', v_new_bal),
    '/profile'
  );

  PERFORM public.try_append_site_log(
    'wallet', 'influencer_commission_reversed', 'warning', v_influencer, NULL,
    jsonb_build_object('orderId', p_order_id, 'orderRef', v_order.order_ref, 'amount', v_amount,
                       'code', v_code, 'newBalance', v_new_bal, 'reference', v_ref));

  RETURN v_amount;
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_influencer_commission_for_order(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_influencer_commission_for_order(uuid) TO service_role;

-- Fires on every refund path: automatic refund in apply_g2bulk_fulfillment, the Telegram and
-- dashboard refund buttons, cancelling a manual order, and the Edge Function's flag heal.
-- A failed reversal never blocks the customer's refund: it is logged and the admins are told.
CREATE OR REPLACE FUNCTION public.trg_orders_reverse_commission_on_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.influencer_commission_paid_at IS NOT NULL
     AND COALESCE(NEW.influencer_commission_usd, 0) > 0
     AND NEW.influencer_commission_reversed_at IS NULL THEN
    BEGIN
      PERFORM public.reverse_influencer_commission_for_order(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      PERFORM public.try_append_site_log(
        'wallet', 'influencer_commission_reversal_failed', 'error', NEW.user_id, NULL,
        jsonb_build_object('orderId', NEW.id, 'orderRef', NEW.order_ref,
                           'amount', NEW.influencer_commission_usd, 'error', SQLERRM));
      BEGIN
        PERFORM public.notify_all_admins(
          'admin_commission_reversal_failed',
          jsonb_build_object('orderId', NEW.id, 'orderRef', NEW.order_ref,
                             'amount', NEW.influencer_commission_usd),
          '/dashboard/logs');
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END;
  END IF;
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_orders_reverse_commission_on_refund() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS orders_reverse_commission_on_refund ON public.orders;
CREATE TRIGGER orders_reverse_commission_on_refund
  AFTER UPDATE OF g2bulk_metadata ON public.orders
  FOR EACH ROW
  WHEN ((NEW.g2bulk_metadata->>'balance_refunded') = 'true'
        AND (OLD.g2bulk_metadata->>'balance_refunded') IS DISTINCT FROM 'true')
  EXECUTE FUNCTION public.trg_orders_reverse_commission_on_refund();

-- ── 3. One refund for failed orders: Telegram and the dashboard share the guards ────────────
-- Body = the live telegram_refund_failed_order (2026-11-14) with the channel as a parameter.
CREATE OR REPLACE FUNCTION public.refund_failed_order_internal(p_order_id uuid, p_admin_id uuid, p_via text, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_meta jsonb;
  v_ref text;
  v_new_balance numeric;
  v_amt text;
  v_via text := COALESCE(NULLIF(trim(p_via), ''), 'admin');
  v_reason text := left(NULLIF(trim(COALESCE(p_reason, '')), ''), 500);
BEGIN
  IF p_admin_id IS NULL
     OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_admin_id AND role = 'admin') THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb);
  v_ref := 'FULFILL-REFUND-' || upper(left(replace(p_order_id::text, '-', ''), 8));

  IF v_meta->>'balance_refunded' = 'true'
     OR EXISTS (SELECT 1 FROM public.transactions WHERE type = 'refund' AND reference = v_ref) THEN
    RAISE EXCEPTION 'refund_already';
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed' OR v_order.fulfillment_status IS DISTINCT FROM 'failed' THEN
    RAISE EXCEPTION 'refund_not_failed';
  END IF;

  IF v_order.payment_method IS DISTINCT FROM 'balance' OR v_order.user_id IS NULL OR COALESCE(v_order.total, 0) <= 0 THEN
    RAISE EXCEPTION 'refund_not_balance';
  END IF;

  IF v_meta->>'do_not_refulfill' = 'true' OR v_meta->>'free_after_refund' = 'true' THEN
    RAISE EXCEPTION 'refund_locked';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id
      AND delivery_items IS NOT NULL
      AND jsonb_typeof(delivery_items) = 'array'
      AND jsonb_array_length(delivery_items) > 0
  ) THEN
    RAISE EXCEPTION 'refund_delivered';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_order.total
  WHERE id = v_order.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'refund_not_found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_order.user_id, 'refund', v_order.total, v_new_balance, 'balance', v_ref, 'completed');

  UPDATE public.orders
  SET g2bulk_metadata = v_meta || jsonb_build_object(
    'balance_refunded', true,
    'refunded_at', now(),
    'refund_balance', v_new_balance,
    'refund_reference', v_ref,
    'refund_via', v_via,
    'refund_by', p_admin_id
  ) || CASE WHEN v_reason IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('refund_reason', v_reason) END
  WHERE id = p_order_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'fulfillment_failed_refunded',
    jsonb_build_object('orderId', p_order_id, 'amount', v_order.total, 'newBalance', v_new_balance),
    '/profile'
  );

  PERFORM public.try_append_site_log(
    'order',
    CASE WHEN v_via = 'telegram_admin' THEN 'refund_via_telegram' ELSE 'refund_via_' || v_via END,
    'info', v_order.user_id, p_admin_id,
    jsonb_build_object('orderId', p_order_id, 'orderRef', v_order.order_ref,
                       'amount', v_order.total, 'newBalance', v_new_balance, 'reason', v_reason)
  );

  v_amt := '$' || trim(to_char(v_order.total, 'FM999999990.00'));
  PERFORM public.telegram_dm_user(
    v_order.user_id, 'order_refunded',
    '💰 <b>تم إرجاع المبلغ إلى رصيدك</b>' || E'\n' || 'الطلب: <code>' || public.telegram_escape(v_order.order_ref) || '</code>' || E'\n'
      || 'المبلغ: <b>' || v_amt || '</b>',
    '💰 <b>Your balance has been refunded</b>' || E'\n' || 'Order: <code>' || public.telegram_escape(v_order.order_ref) || '</code>' || E'\n'
      || 'Amount: <b>' || v_amt || '</b>',
    jsonb_build_array(jsonb_build_array(jsonb_build_object('text', '💰 رصيدي', 'callback_data', 'my_balance'))),
    jsonb_build_array(jsonb_build_array(jsonb_build_object('text', '💰 My balance', 'callback_data', 'my_balance')))
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'orderRef', v_order.order_ref,
    'userId', v_order.user_id,
    'amount', v_order.total,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE ALL ON FUNCTION public.refund_failed_order_internal(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated, service_role;

-- Same name, arguments, errors and result as before (the bot is unchanged).
CREATE OR REPLACE FUNCTION public.telegram_refund_failed_order(p_order_id uuid, p_admin_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN public.refund_failed_order_internal(p_order_id, p_admin_id, 'telegram_admin', NULL);
END;
$$;

REVOKE ALL ON FUNCTION public.telegram_refund_failed_order(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_refund_failed_order(uuid, uuid) TO service_role;

-- Dashboard button. The admin is the signed-in caller, never a parameter.
CREATE OR REPLACE FUNCTION public.admin_refund_failed_order(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN public.refund_failed_order_internal(p_order_id, auth.uid(), 'dashboard', p_reason);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_refund_failed_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_refund_failed_order(uuid, text) TO authenticated, service_role;

-- ── 4. Daily wallet ↔ ledger check ──────────────────────────────────────────────────────────
-- Ledger rule: every completed transaction moves the wallet, except a purchase paid outside
-- the wallet (ShamCash / Syriatel / Binance orders are recorded as purchases with their own
-- payment_method but never touch the balance).
CREATE OR REPLACE FUNCTION public.balance_ledger_mismatches()
RETURNS TABLE (user_id uuid, balance numeric, ledger numeric, gap numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH l AS (
    SELECT t.user_id, sum(t.amount) AS ledger
    FROM public.transactions t
    WHERE t.status = 'completed'
      AND NOT (t.type = 'purchase' AND COALESCE(t.payment_method, '') <> 'balance')
    GROUP BY t.user_id
  )
  SELECT p.id, COALESCE(p.balance, 0), COALESCE(l.ledger, 0), COALESCE(p.balance, 0) - COALESCE(l.ledger, 0)
  FROM public.profiles p
  LEFT JOIN l ON l.user_id = p.id
  WHERE COALESCE(p.balance, 0) <> COALESCE(l.ledger, 0);
$$;

REVOKE ALL ON FUNCTION public.balance_ledger_mismatches() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.balance_ledger_mismatches() TO service_role;

CREATE TABLE IF NOT EXISTS public.balance_ledger_checks (
  id bigserial PRIMARY KEY,
  checked_at timestamptz NOT NULL DEFAULT now(),
  users_checked integer NOT NULL,
  mismatch_count integer NOT NULL,
  total_gap numeric(12,2) NOT NULL,
  mismatches jsonb NOT NULL DEFAULT '[]'::jsonb,
  alerted boolean NOT NULL DEFAULT false
);

ALTER TABLE public.balance_ledger_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.balance_ledger_checks FROM anon, authenticated;
GRANT SELECT ON TABLE public.balance_ledger_checks TO authenticated;
DROP POLICY IF EXISTS "Admins read balance checks" ON public.balance_ledger_checks;
CREATE POLICY "Admins read balance checks" ON public.balance_ledger_checks
  FOR SELECT TO authenticated USING (public.is_admin());

CREATE INDEX IF NOT EXISTS balance_ledger_checks_checked_at_idx
  ON public.balance_ledger_checks (checked_at DESC);

-- Plain-text Telegram message to the admin chats, if Telegram alerts are on and the
-- 'balanceLedger' alert isn't switched off.
CREATE OR REPLACE FUNCTION public.send_admin_telegram_text(p_kind text, p_text text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_token text;
  v_chat text;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  IF NOT COALESCE(v_row.telegram_alerts_enabled, false) THEN
    RETURN;
  END IF;
  IF COALESCE((v_row.telegram_alert_prefs->>p_kind)::boolean, true) = false THEN
    RETURN;
  END IF;
  v_token := NULLIF(trim(COALESCE(v_row.telegram_bot_token, '')), '');
  IF v_token IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_chat IN ARRAY public.telegram_admin_chat_ids(v_row.telegram_chat_id) LOOP
    PERFORM public.telegram_post(
      v_token,
      jsonb_build_object('chat_id', v_chat, 'text', left(p_text, 3500), 'parse_mode', 'HTML',
                         'disable_web_page_preview', true),
      'admin:' || p_kind,
      30000);
  END LOOP;
EXCEPTION WHEN OTHERS THEN
  NULL; -- an alert must never break the check
END;
$$;

REVOKE ALL ON FUNCTION public.send_admin_telegram_text(text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_admin_telegram_text(text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.run_balance_ledger_check()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rows jsonb;
  v_count integer;
  v_gap numeric;
  v_users integer;
  v_prev public.balance_ledger_checks%ROWTYPE;
  v_last_alert timestamptz;
  v_alert boolean := false;
  v_resolved boolean := false;
  v_gap_txt text;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', m.user_id, 'balance', m.balance,
                                               'ledger', m.ledger, 'gap', m.gap)
                            ORDER BY abs(m.gap) DESC, m.user_id), '[]'::jsonb),
         count(*),
         COALESCE(round(sum(abs(m.gap)), 2), 0)
  INTO v_rows, v_count, v_gap
  FROM public.balance_ledger_mismatches() m;

  SELECT count(*) INTO v_users FROM public.profiles;

  SELECT * INTO v_prev FROM public.balance_ledger_checks ORDER BY checked_at DESC, id DESC LIMIT 1;
  SELECT max(checked_at) INTO v_last_alert FROM public.balance_ledger_checks WHERE alerted;

  IF v_count > 0 THEN
    v_alert := v_prev.id IS NULL
      OR v_prev.mismatches IS DISTINCT FROM v_rows
      OR v_last_alert IS NULL
      OR v_last_alert < now() - interval '7 days';
  ELSIF v_prev.id IS NOT NULL AND v_prev.mismatch_count > 0 THEN
    v_alert := true;
    v_resolved := true;
  END IF;

  INSERT INTO public.balance_ledger_checks (users_checked, mismatch_count, total_gap, mismatches, alerted)
  VALUES (v_users, v_count, v_gap, v_rows, v_alert);

  IF v_alert THEN
    v_gap_txt := '$' || trim(to_char(v_gap, 'FM999999990.00'));
    PERFORM public.try_append_site_log(
      'wallet',
      CASE WHEN v_resolved THEN 'balance_ledger_resolved' ELSE 'balance_ledger_mismatch' END,
      CASE WHEN v_resolved THEN 'info' ELSE 'error' END,
      NULL, NULL,
      jsonb_build_object('mismatchCount', v_count, 'totalGap', v_gap, 'usersChecked', v_users,
                         'mismatches', v_rows));
    BEGIN
      PERFORM public.notify_all_admins(
        CASE WHEN v_resolved THEN 'admin_balance_ledger_resolved' ELSE 'admin_balance_ledger_mismatch' END,
        jsonb_build_object('count', v_count, 'totalGap', v_gap),
        '/dashboard/logs');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM public.send_admin_telegram_text(
      'balanceLedger',
      CASE WHEN v_resolved THEN
        '✅ <b>فحص الأرصدة</b>: كل المحافظ صارت مطابقة لسجل الحركات.' || E'\n'
          || '✅ <b>Balance check</b>: every wallet matches its transactions again.'
      ELSE
        '⚠️ <b>فحص الأرصدة</b>: ' || v_count || ' محفظة رصيدها مو مطابق لسجل الحركات (الفرق ' || v_gap_txt || ').' || E'\n'
          || '⚠️ <b>Balance check</b>: ' || v_count || ' wallet(s) don''t match their transactions (gap ' || v_gap_txt || ').' || E'\n'
          || 'Dashboard → Logs → wallet.'
      END);
  END IF;

  RETURN jsonb_build_object('checkedAt', now(), 'usersChecked', v_users, 'mismatchCount', v_count,
                            'totalGap', v_gap, 'alerted', v_alert, 'resolved', v_resolved);
END;
$$;

REVOKE ALL ON FUNCTION public.run_balance_ledger_check() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_balance_ledger_check() TO service_role;

-- Admin view of the latest check plus the mismatches right now (for the dashboard / SQL editor).
CREATE OR REPLACE FUNCTION public.admin_get_balance_ledger_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_last public.balance_ledger_checks%ROWTYPE;
  v_now jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_last FROM public.balance_ledger_checks ORDER BY checked_at DESC, id DESC LIMIT 1;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('userId', m.user_id, 'username', p.username,
                                               'balance', m.balance, 'ledger', m.ledger, 'gap', m.gap)
                            ORDER BY abs(m.gap) DESC), '[]'::jsonb)
  INTO v_now
  FROM public.balance_ledger_mismatches() m
  LEFT JOIN public.profiles p ON p.id = m.user_id;
  RETURN jsonb_build_object(
    'lastCheckedAt', v_last.checked_at,
    'lastMismatchCount', v_last.mismatch_count,
    'mismatchesNow', v_now,
    'mismatchCountNow', jsonb_array_length(v_now)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_balance_ledger_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_balance_ledger_status() TO authenticated, service_role;

-- Closing a mismatch after looking into it: records the wallet's unexplained difference as a
-- ledger row (payment_method 'admin_correction', no money moves). It can only close the gap
-- that exists right now, never open one. If the money shouldn't be in the wallet, follow it
-- with a normal admin_adjust_user_balance debit.
CREATE OR REPLACE FUNCTION public.admin_record_ledger_correction(p_user_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reason text := trim(COALESCE(p_reason, ''));
  v_balance numeric;
  v_gap numeric;
  v_ref text := 'LEDGER-FIX-' || to_char(now(), 'YYYYMMDDHH24MISS');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF length(v_reason) < 5 THEN
    RAISE EXCEPTION 'Reason must be at least 5 characters';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_balance FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT m.gap INTO v_gap FROM public.balance_ledger_mismatches() m WHERE m.user_id = p_user_id;
  IF v_gap IS NULL OR v_gap = 0 THEN
    RAISE EXCEPTION 'no_mismatch';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status, metadata)
  VALUES (p_user_id, 'adjustment', v_gap, v_balance, 'admin_correction', v_ref, 'completed',
          jsonb_build_object('reason', v_reason, 'by', auth.uid(), 'ledgerOnly', true));

  PERFORM public.try_append_site_log(
    'wallet', 'ledger_correction', 'warning', p_user_id, auth.uid(),
    jsonb_build_object('gap', v_gap, 'balance', v_balance, 'reason', v_reason, 'reference', v_ref));

  RETURN jsonb_build_object('userId', p_user_id, 'recorded', v_gap, 'balance', v_balance, 'reference', v_ref);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_ledger_correction(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_record_ledger_correction(uuid, text) TO authenticated, service_role;

-- Every day at 03:15 UTC (06:15 Damascus).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'balance-ledger-daily') THEN
    PERFORM cron.unschedule('balance-ledger-daily');
  END IF;
  PERFORM cron.schedule('balance-ledger-daily', '15 3 * * *', 'SELECT public.run_balance_ledger_check()');
END $$;
