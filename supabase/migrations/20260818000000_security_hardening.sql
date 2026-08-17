-- =============================================================================
-- SECURITY HARDENING (2026-08-18)
-- 1) protect_profile_sensitive_fields: freeze partner_tier_id + dev_test_balance
--    so customers cannot self-assign near-cost partner pricing via REST PATCH.
-- 2) expire_stale_pending_recharges: non-admins only clean up their OWN stale
--    recharge requests (previously any user could cancel everyone's).
-- 3) complete_recharge_from_binance_pay_order: require a confirmed paid_amount
--    >= order_amount (set from the signed /order/query by the webhook handler);
--    never fall back to the requested order_amount. Credit capped at requested.
-- 4) Drop the duplicate 2-arg create_recharge_request (client uses the 3-arg
--    version with p_pay_currency).
-- 5) offers column lockdown: revoke table-level SELECT for anon/authenticated
--    and grant the safe columns only. g2bulk_cost_usd + pricing_margin_percent
--    become 401 for REST callers. Storefront reads go through public_offers.
-- =============================================================================

-- 1) Profile trigger: freeze pricing entitlements -----------------------------
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    IF TG_OP = 'UPDATE' THEN
      -- never let client set another user's id
      NEW.id := OLD.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_sensitive_fields();

-- 2) Recharge cleanup: own rows only for non-admins ---------------------------
CREATE OR REPLACE FUNCTION public.expire_stale_pending_recharges(
  p_max_age_minutes int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_minutes int := GREATEST(10, LEAST(COALESCE(p_max_age_minutes, 20), 1440));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
  v_uid uuid := auth.uid();
  -- Non-admins may only clean up their OWN stale recharges (never other users').
  v_own_only boolean := v_uid IS NOT NULL AND NOT public.is_admin();
BEGIN

  -- 1) pending/payment_sent with expired Sam invoice
  WITH expired_inv AS (
    SELECT DISTINCT r.id
    FROM public.recharge_requests r
    JOIN public.sam_invoices si
      ON si.entity_type = 'recharge'
     AND si.entity_id = r.id
    WHERE r.status IN ('pending', 'payment_sent')
      AND (NOT v_own_only OR r.user_id = v_uid)
      AND (
        COALESCE(si.status, '') IN ('expired', 'failed', 'cancelled')
        OR (si.expires_at IS NOT NULL AND si.expires_at <= now())
      )
  ),
  upd AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    FROM expired_inv e
    WHERE r.id = e.id
      AND r.status IN ('pending', 'payment_sent')
    RETURNING r.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM upd;

  v_cancelled := coalesce(array_length(v_ids, 1), 0);

  -- 2) Abandoned pending without a paid path — older than cutoff
  WITH stale AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    WHERE r.status = 'pending'
      AND (NOT v_own_only OR r.user_id = v_uid)
      AND r.created_at < v_cutoff
      AND r.id <> ALL (v_ids)
    RETURNING r.id
  )
  SELECT v_cancelled + coalesce((SELECT count(*)::int FROM stale), 0)
  INTO v_cancelled;

  -- Mark open Sam invoices as expired for cancelled recharges (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'recharge'
      AND si.entity_id IN (
        SELECT id FROM public.recharge_requests
        WHERE status = 'cancelled'
          AND (NOT v_own_only OR user_id = v_uid)
          AND updated_at > now() - interval '2 minutes'
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled', 'expired');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) TO service_role;

-- 3) Binance credit RPC: confirmed paid amount required -----------------------
CREATE OR REPLACE FUNCTION public.complete_recharge_from_binance_pay_order(p_merchant_trade_no text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ord public.binance_pay_orders%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
  v_paid numeric(12,2);
  v_credit numeric(10,2);
BEGIN
  SELECT * INTO v_ord
  FROM public.binance_pay_orders
  WHERE merchant_trade_no = p_merchant_trade_no
  FOR UPDATE;

  IF v_ord.id IS NULL THEN
    RAISE EXCEPTION 'Binance Pay order not found';
  END IF;

  IF v_ord.entity_type IS DISTINCT FROM 'recharge' OR v_ord.recharge_request_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_ord.recharge_request_id
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

  -- SECURITY: only credit after Binance confirmed the payment via the signed
  -- /order/query (the webhook handler sets paid_amount from that query). Never
  -- fall back to the requested order amount — a spoofed webhook must not mint
  -- balance. Credit is capped at the requested order amount.
  IF v_ord.paid_amount IS NULL OR v_ord.paid_amount <= 0 THEN
    RAISE EXCEPTION 'Paid amount is not confirmed by Binance';
  END IF;
  IF v_ord.paid_amount < v_ord.order_amount THEN
    RAISE EXCEPTION 'Paid amount is less than the requested order amount';
  END IF;
  v_paid := round(v_ord.paid_amount::numeric, 2);
  v_credit := round(LEAST(v_paid, v_ord.order_amount), 2);
  IF v_credit < 0.01 THEN
    RAISE EXCEPTION 'Paid amount too small to credit';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_ord.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_ord.merchant_trade_no
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_credit
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_credit, v_new_balance, 'Binance Pay', v_ref, 'completed');

  UPDATE public.recharge_requests
  SET status = 'approved', credited_amount = v_credit, reviewed_at = now(), updated_at = now()
  WHERE id = v_row.id;

  UPDATE public.binance_pay_orders
  SET status = 'paid', paid_amount = v_credit,
    webhook_received_at = COALESCE(webhook_received_at, now()), updated_at = now()
  WHERE id = v_ord.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id, 'amount', v_credit, 'requestedAmount', v_row.amount,
      'creditedAmount', v_credit, 'paidAmount', v_paid, 'payCurrency', v_ord.currency,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', v_row.id, 'userId', v_row.user_id, 'amount', v_credit,
    'requestedAmount', v_row.amount, 'creditedAmount', v_credit, 'paidAmount', v_paid,
    'payCurrency', v_ord.currency, 'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_recharge_from_binance_pay_order(text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_recharge_from_binance_pay_order(text) TO service_role;

-- 4) Drop duplicate 2-arg create_recharge_request -----------------------------
-- The canonical 3-arg version (p_amount, p_payment_method, p_pay_currency) is
-- the only one the app calls. Removing the 2-arg overload avoids two divergent
-- definitions (the 2-arg lacked SYP/pay_currency handling).
DROP FUNCTION IF EXISTS public.create_recharge_request(numeric, text);

-- 5) offers column lockdown + storefront view ---------------------------------
-- The live offers table may predate these columns in this bootstrap — ensure
-- they exist before the view references them (no-op when already present).
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS amount text,
  ADD COLUMN IF NOT EXISTS image_url text;

CREATE OR REPLACE VIEW public.public_offers AS
SELECT
  id, game_id, name_en, name_ar, price, amount, region,
  description_en, description_ar, active,
  sale_image_url, is_sale, original_price,
  image_url, image_custom, sale_image_custom,
  created_at,
  g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id,
  catalog_source, g2bulk_catalogue_id, g2bulk_synced_at
FROM public.offers;

GRANT SELECT ON public.public_offers TO anon, authenticated;

-- Lock the sensitive columns from REST: any request that asks for them gets
-- 401, and `select=*` expands to the granted columns only (modern PostgREST).
-- pricing_mode stays readable because admin pricing tooling selects it
-- directly from the table (it is a policy flag, not money).
REVOKE SELECT ON TABLE public.offers FROM anon, authenticated;
GRANT SELECT (
  id, game_id, name_en, name_ar, price, amount, region,
  description_en, description_ar, active,
  sale_image_url, is_sale, original_price,
  image_url, image_custom, sale_image_custom,
  created_at,
  g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id,
  catalog_source, g2bulk_catalogue_id, g2bulk_synced_at,
  pricing_mode
) ON public.offers TO anon, authenticated;
