-- REVERT for 20261114090000_money_hardening.sql
-- Run manually (SQL editor) ONLY if the hardening broke something. Prefer fixing forward:
-- this re-opens direct admin balance writes and leaves refunded orders' commissions paid.
--
-- Restores the exact pre-change bodies and EXECUTE grants of credit_user_balance and
-- telegram_refund_failed_order from echocore_backup.function_snapshots
-- (label '2026-11-14-money-hardening'), then drops everything the migration added.
-- Kept on purpose (data, harmless): the orders.influencer_commission_reversed_* columns and
-- the balance_ledger_checks table. Ledger rows already written stay: they are real money moves.

BEGIN;

DO $$
DECLARE
  s record;
  sig regprocedure;
  n int := 0;
BEGIN
  FOR s IN
    SELECT DISTINCT ON (proname, args) proname, args, definition, authenticated_exec, anon_exec
    FROM echocore_backup.function_snapshots
    WHERE label = '2026-11-14-money-hardening'
      AND proname IN ('credit_user_balance', 'telegram_refund_failed_order')
    ORDER BY proname, args, taken_at
  LOOP
    EXECUTE s.definition;
    sig := format('public.%I(%s)', s.proname, s.args)::regprocedure;
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', sig);
    IF s.authenticated_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', sig);
    END IF;
    IF s.anon_exec THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon', sig);
    END IF;
    n := n + 1;
  END LOOP;
  IF n <> 2 THEN
    RAISE EXCEPTION 'Expected 2 snapshots for 2026-11-14-money-hardening, found %', n;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'balance-ledger-daily') THEN
    PERFORM cron.unschedule('balance-ledger-daily');
  END IF;
END $$;

DROP TRIGGER IF EXISTS zz_profiles_balance_via_rpc_only ON public.profiles;
DROP TRIGGER IF EXISTS orders_reverse_commission_on_refund ON public.orders;

DROP FUNCTION IF EXISTS public.guard_direct_balance_write();
DROP FUNCTION IF EXISTS public.trg_orders_reverse_commission_on_refund();
DROP FUNCTION IF EXISTS public.reverse_influencer_commission_for_order(uuid);
DROP FUNCTION IF EXISTS public.admin_refund_failed_order(uuid, text);
DROP FUNCTION IF EXISTS public.refund_failed_order_internal(uuid, uuid, text, text);
DROP FUNCTION IF EXISTS public.admin_get_balance_ledger_status();
DROP FUNCTION IF EXISTS public.admin_record_ledger_correction(uuid, text);
DROP FUNCTION IF EXISTS public.run_balance_ledger_check();
DROP FUNCTION IF EXISTS public.send_admin_telegram_text(text, text);
DROP FUNCTION IF EXISTS public.balance_ledger_mismatches();

COMMIT;
