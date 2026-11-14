-- Tests for 20261114090000_money_hardening.sql. Run by scripts/test-money-sql.sh inside one
-- transaction that is rolled back (nothing is kept). Fixtures are invented: no real data.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

-- ── fixtures ────────────────────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'admin@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000c1', 'buyer@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000000b1', 'influencer@test.invalid', 'authenticated', 'authenticated');

INSERT INTO public.profiles (id, role, name, balance) VALUES
  ('00000000-0000-4000-8000-0000000000a1', 'admin', 'Admin', 0),
  ('00000000-0000-4000-8000-0000000000c1', 'user', 'Buyer', 0),
  ('00000000-0000-4000-8000-0000000000b1', 'user', 'Influencer', 0)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role, name = EXCLUDED.name, balance = 0;

INSERT INTO public.games (id, slug, name_en, name_ar, points_name)
VALUES ('00000000-0000-4000-8000-0000000000e1', 'test-game', 'Test game', 'Test game', 'Gems');
INSERT INTO public.offers (id, game_id, name_en, name_ar, price, g2bulk_cost_usd)
VALUES ('00000000-0000-4000-8000-0000000000f1', '00000000-0000-4000-8000-0000000000e1', '100 Gems', '100 Gems', 10, 8);

INSERT INTO public.influencer_coupons (id, code, influencer_user_id, influencer_margin_percent, redemption_count)
VALUES ('00000000-0000-4000-8000-0000000000cc', 'TESTCODE', '00000000-0000-4000-8000-0000000000b1', 50, 0);

-- Buyer gets $30 the audited way (as the admin).
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
SELECT public.admin_adjust_user_balance('00000000-0000-4000-8000-0000000000c1', 30, 'credit', 'test credit', NULL);
SELECT set_config('request.jwt.claim.sub', '', true);

-- Two paid (balance) orders with the influencer code, each $10: one will fail and be refunded.
DO $$
DECLARE
  o uuid;
BEGIN
  FOREACH o IN ARRAY ARRAY['00000000-0000-4000-8000-000000000101'::uuid, '00000000-0000-4000-8000-000000000102'::uuid,
                           '00000000-0000-4000-8000-000000000103'::uuid] LOOP
    PERFORM set_config('echocore.allow_balance_change', '1', true);
    UPDATE public.profiles SET balance = balance - 10 WHERE id = '00000000-0000-4000-8000-0000000000c1';
    INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, status)
    SELECT id, 'purchase', -10, balance, 'balance', 'completed' FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000c1';
    INSERT INTO public.orders (id, user_id, total, payment_method, status, fulfillment_status, influencer_coupon_id)
    VALUES (o, '00000000-0000-4000-8000-0000000000c1', 10, 'balance', 'completed', 'fulfilling',
            '00000000-0000-4000-8000-0000000000cc');
    INSERT INTO public.order_items (order_id, offer_id, name_snapshot, price, quantity)
    VALUES (o, '00000000-0000-4000-8000-0000000000f1', '100 Gems', 10, 1);
    PERFORM public.pay_influencer_commission_for_order(o);
  END LOOP;
END $$;

DO $$
DECLARE
  v numeric;
BEGIN
  SELECT balance INTO v FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1';
  IF v <> 3 THEN RAISE EXCEPTION 'FAIL fixture: influencer should hold 3 x $1 commission, has %', v; END IF;
  SELECT balance INTO v FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000c1';
  IF v <> 0 THEN RAISE EXCEPTION 'FAIL fixture: buyer should be at $0, has %', v; END IF;
END $$;

-- ── 1. Balance only through SQL functions ───────────────────────────────────────────────────
SELECT set_config('echocore.allow_balance_change', '', true);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);

DO $$
BEGIN
  UPDATE public.profiles SET balance = 999 WHERE id = '00000000-0000-4000-8000-0000000000c1';
  RAISE EXCEPTION 'FAIL 1a: admin wrote a balance directly';
EXCEPTION WHEN insufficient_privilege THEN
  IF SQLERRM NOT LIKE 'balance_direct_write_blocked%' THEN RAISE; END IF;
END $$;

-- Other profile fields stay editable by the admin.
UPDATE public.profiles SET bio = 'edited by admin' WHERE id = '00000000-0000-4000-8000-0000000000c1';

-- admin_adjust_user_balance still works, and credit_user_balance goes through it (ledger row + log).
SELECT public.admin_adjust_user_balance('00000000-0000-4000-8000-0000000000c1', 1, 'credit', 'test credit', NULL);
SELECT public.credit_user_balance('00000000-0000-4000-8000-0000000000c1', 2, 'ShamCash', 'abc');
RESET ROLE;

DO $$
DECLARE
  v numeric;
  n int;
BEGIN
  SELECT balance INTO v FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000c1';
  IF v <> 3 THEN RAISE EXCEPTION 'FAIL 1b: buyer balance should be 3, is %', v; END IF;
  SELECT count(*) INTO n FROM public.transactions
  WHERE user_id = '00000000-0000-4000-8000-0000000000c1' AND type = 'adjustment' AND payment_method = 'admin_manual';
  IF n <> 3 THEN RAISE EXCEPTION 'FAIL 1c: expected 3 admin_manual ledger rows, got %', n; END IF;
END $$;

-- (each REST call is its own transaction: clear the flag the RPCs above set in this one)
SELECT set_config('echocore.allow_balance_change', '', true);
-- A customer editing their own row still can't change their balance (silently kept), and no error.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
UPDATE public.profiles SET balance = 500, bio = 'mine' WHERE id = '00000000-0000-4000-8000-0000000000c1';
RESET ROLE;
DO $$
BEGIN
  IF (SELECT balance FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000c1') <> 3 THEN
    RAISE EXCEPTION 'FAIL 1d: customer changed own balance';
  END IF;
END $$;

-- service_role (Edge Functions, scripts) can't write it directly either.
SELECT set_config('request.jwt.claim.sub', '', true);
SET ROLE service_role;
DO $$
BEGIN
  UPDATE public.profiles SET balance = 999 WHERE id = '00000000-0000-4000-8000-0000000000c1';
  RAISE EXCEPTION 'FAIL 1e: service_role wrote a balance directly';
EXCEPTION WHEN insufficient_privilege THEN
  NULL;
END $$;
RESET ROLE;

-- ── 6. Refund button: guards ────────────────────────────────────────────────────────────────
-- or01 failed; or02 failed but has delivery codes; or03 still fulfilling.
UPDATE public.orders SET fulfillment_status = 'failed'
WHERE id IN ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102');
UPDATE public.order_items SET delivery_items = '["CODE-1"]'::jsonb
WHERE order_id = '00000000-0000-4000-8000-000000000102';

SET ROLE authenticated;
-- a customer can't use it
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
DO $$
BEGIN
  PERFORM public.admin_refund_failed_order('00000000-0000-4000-8000-000000000101');
  RAISE EXCEPTION 'FAIL 6a: customer refunded an order';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'Unauthorized' THEN RAISE; END IF;
END $$;
-- nor the internal function / Telegram one / reversal
DO $$
BEGIN
  PERFORM public.refund_failed_order_internal('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a1', 'x');
  RAISE EXCEPTION 'FAIL 6b: client called refund_failed_order_internal';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM public.telegram_refund_failed_order('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000000a1');
  RAISE EXCEPTION 'FAIL 6c: client called telegram_refund_failed_order';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
  PERFORM public.reverse_influencer_commission_for_order('00000000-0000-4000-8000-000000000101');
  RAISE EXCEPTION 'FAIL 6d: client called reverse_influencer_commission_for_order';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
DO $$
BEGIN
  PERFORM public.admin_refund_failed_order('00000000-0000-4000-8000-000000000102');
  RAISE EXCEPTION 'FAIL 6e: refunded an order with delivered codes';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'refund_delivered' THEN RAISE; END IF;
END $$;
DO $$
BEGIN
  PERFORM public.admin_refund_failed_order('00000000-0000-4000-8000-000000000103');
  RAISE EXCEPTION 'FAIL 6f: refunded an order that has not failed';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'refund_not_failed' THEN RAISE; END IF;
END $$;

-- the real refund (as the admin, from the dashboard)
SELECT public.admin_refund_failed_order('00000000-0000-4000-8000-000000000101', 'supplier failed');

DO $$
BEGIN
  PERFORM public.admin_refund_failed_order('00000000-0000-4000-8000-000000000101');
  RAISE EXCEPTION 'FAIL 6g: refunded the same order twice';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'refund_already' THEN RAISE; END IF;
END $$;
RESET ROLE;

-- ── 2. Commission taken back ────────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_buyer numeric;
  v_inf numeric;
  v_meta jsonb;
  v_rev timestamptz;
  v_n int;
  v_count int;
BEGIN
  SELECT balance INTO v_buyer FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000c1';
  IF v_buyer <> 13 THEN RAISE EXCEPTION 'FAIL 6h: buyer should be 3 + 10 refund = 13, is %', v_buyer; END IF;

  SELECT g2bulk_metadata, influencer_commission_reversed_at INTO v_meta, v_rev
  FROM public.orders WHERE id = '00000000-0000-4000-8000-000000000101';
  IF v_meta->>'refund_via' <> 'dashboard' OR v_meta->>'refund_reason' <> 'supplier failed' THEN
    RAISE EXCEPTION 'FAIL 6i: refund metadata wrong: %', v_meta;
  END IF;
  IF v_rev IS NULL THEN RAISE EXCEPTION 'FAIL 2a: commission not marked reversed'; END IF;

  SELECT balance INTO v_inf FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1';
  IF v_inf <> 2 THEN RAISE EXCEPTION 'FAIL 2b: influencer should be 3 - 1 = 2, is %', v_inf; END IF;

  SELECT count(*) INTO v_n FROM public.transactions
  WHERE user_id = '00000000-0000-4000-8000-0000000000b1' AND payment_method = 'influencer_commission_reversal'
    AND amount = -1;
  IF v_n <> 1 THEN RAISE EXCEPTION 'FAIL 2c: expected one reversal ledger row, got %', v_n; END IF;

  SELECT redemption_count INTO v_count FROM public.influencer_coupons WHERE id = '00000000-0000-4000-8000-0000000000cc';
  IF v_count <> 2 THEN RAISE EXCEPTION 'FAIL 2d: redemption_count should drop 3 -> 2, is %', v_count; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE user_id = '00000000-0000-4000-8000-0000000000b1' AND type = 'influencer_commission_reversed') THEN
    RAISE EXCEPTION 'FAIL 2e: influencer not notified';
  END IF;
END $$;

-- Touching the metadata again (flag already true) does not reverse twice.
UPDATE public.orders SET g2bulk_metadata = g2bulk_metadata || '{"note":"x"}'::jsonb
WHERE id = '00000000-0000-4000-8000-000000000101';
SELECT public.reverse_influencer_commission_for_order('00000000-0000-4000-8000-000000000101');
DO $$
BEGIN
  IF (SELECT balance FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1') <> 2 THEN
    RAISE EXCEPTION 'FAIL 2f: commission reversed twice';
  END IF;
END $$;

-- Other refund paths: the automatic refund in apply_g2bulk_fulfillment (service role) also
-- takes the commission back, and the influencer may go below zero.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
SELECT public.admin_adjust_user_balance('00000000-0000-4000-8000-0000000000b1', 2, 'debit', 'spent it', NULL);
RESET ROLE;
UPDATE public.store_settings SET g2bulk_auto_refund_on_fail = true WHERE id = 1;
INSERT INTO public.store_settings (id, g2bulk_auto_refund_on_fail)
SELECT 1, true WHERE NOT EXISTS (SELECT 1 FROM public.store_settings WHERE id = 1);
SELECT set_config('request.jwt.claim.sub', '', true);
SET ROLE service_role;
SELECT public.apply_g2bulk_fulfillment('00000000-0000-4000-8000-000000000103', 'failed', NULL, NULL, '{}'::jsonb, 'test failure');
RESET ROLE;
DO $$
DECLARE
  v numeric;
BEGIN
  IF (SELECT g2bulk_metadata->>'balance_refunded' FROM public.orders WHERE id = '00000000-0000-4000-8000-000000000103') <> 'true' THEN
    RAISE EXCEPTION 'FAIL 2g: auto refund did not run';
  END IF;
  SELECT balance INTO v FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000b1';
  IF v <> -1 THEN RAISE EXCEPTION 'FAIL 2h: influencer should be 0 - 1 = -1 after auto refund, is %', v; END IF;
END $$;

-- ── 5. Ledger check ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  r jsonb;
BEGIN
  -- everything above went through the ledger
  IF EXISTS (SELECT 1 FROM public.balance_ledger_mismatches()
             WHERE user_id IN ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000b1',
                               '00000000-0000-4000-8000-0000000000c1')) THEN
    RAISE EXCEPTION 'FAIL 5a: fixtures should match their ledgers: %',
      (SELECT jsonb_agg(m) FROM public.balance_ledger_mismatches() m);
  END IF;
END $$;

-- A wallet-free purchase (ShamCash order) is recorded but must not count.
INSERT INTO public.transactions (user_id, type, amount, payment_method, status)
VALUES ('00000000-0000-4000-8000-0000000000c1', 'purchase', -7, 'ShamCash', 'completed');
-- A balance moved without a ledger row (what the check is for).
DO $$
BEGIN
  PERFORM set_config('echocore.allow_balance_change', '1', true);
  UPDATE public.profiles SET balance = balance + 4.5 WHERE id = '00000000-0000-4000-8000-0000000000c1';
END $$;

DELETE FROM public.balance_ledger_checks;
DO $$
DECLARE
  r jsonb;
  m jsonb;
BEGIN
  r := public.run_balance_ledger_check();
  SELECT mismatches INTO m FROM public.balance_ledger_checks ORDER BY id DESC LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(m) e
                 WHERE e->>'userId' = '00000000-0000-4000-8000-0000000000c1' AND (e->>'gap')::numeric = 4.5) THEN
    RAISE EXCEPTION 'FAIL 5b: mismatch of 4.5 not found: %', m;
  END IF;
  IF (r->>'alerted')::boolean IS NOT TRUE THEN RAISE EXCEPTION 'FAIL 5c: first mismatch should alert'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notifications
                 WHERE user_id = '00000000-0000-4000-8000-0000000000a1' AND type = 'admin_balance_ledger_mismatch') THEN
    RAISE EXCEPTION 'FAIL 5d: admin not notified';
  END IF;

  r := public.run_balance_ledger_check();
  IF (r->>'alerted')::boolean THEN RAISE EXCEPTION 'FAIL 5e: unchanged mismatches alerted again'; END IF;

  -- the admin records the unexplained 4.5 (ledger only), then debits it the normal way
  PERFORM set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
  BEGIN
    PERFORM public.admin_record_ledger_correction('00000000-0000-4000-8000-0000000000a1', 'nothing to fix here');
    RAISE EXCEPTION 'FAIL 5l: correction recorded for a wallet that matches';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'no_mismatch' THEN RAISE; END IF;
  END;
  r := public.admin_record_ledger_correction('00000000-0000-4000-8000-0000000000c1', 'unrecorded 2026 credit');
  IF (r->>'recorded')::numeric <> 4.5 THEN RAISE EXCEPTION 'FAIL 5m: correction should record 4.5, got %', r; END IF;
  IF (SELECT balance FROM public.profiles WHERE id = '00000000-0000-4000-8000-0000000000c1') <> 3 + 10 + 10 + 4.5 THEN
    RAISE EXCEPTION 'FAIL 5n: a ledger correction moved money';
  END IF;
  PERFORM public.admin_adjust_user_balance('00000000-0000-4000-8000-0000000000c1', 4.5, 'debit', 'reconcile', NULL);
  PERFORM set_config('request.jwt.claim.sub', '', true);
  -- only our fixtures exist in a schema-only copy
  r := public.run_balance_ledger_check();
  IF (r->>'mismatchCount')::int <> 0 OR (r->>'resolved')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL 5f: expected resolved, got %', r;
  END IF;
END $$;

-- clients can't run it or read the table unless admin
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000c1', true);
DO $$
BEGIN
  PERFORM public.run_balance_ledger_check();
  RAISE EXCEPTION 'FAIL 5g: customer ran the check';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.balance_ledger_checks) THEN
    RAISE EXCEPTION 'FAIL 5h: customer can read balance_ledger_checks';
  END IF;
END $$;
DO $$
BEGIN
  PERFORM public.admin_get_balance_ledger_status();
  RAISE EXCEPTION 'FAIL 5i: customer read the ledger status';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM <> 'Unauthorized' THEN RAISE; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000000a1', true);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.balance_ledger_checks) THEN
    RAISE EXCEPTION 'FAIL 5j: admin cannot read balance_ledger_checks';
  END IF;
  PERFORM public.admin_get_balance_ledger_status();
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'balance-ledger-daily' AND schedule = '15 3 * * *') THEN
    RAISE EXCEPTION 'FAIL 5k: daily cron job missing';
  END IF;
END $$;

SELECT 'money_hardening tests: all passed' AS result;
