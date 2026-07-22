-- =============================================================================
-- Cart multi-buy + purchase security hardening
-- Run in Supabase SQL Editor on existing projects.
-- - Active offer checks + quantity in totals
-- - Max line items
-- - Idempotency key (safe client retries / double-submit)
-- - Keeps per-user advisory lock + balance FOR UPDATE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.purchase_idempotency (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key text NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX IF NOT EXISTS purchase_idempotency_created_idx
  ON public.purchase_idempotency (created_at DESC);

ALTER TABLE public.purchase_idempotency ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own purchase_idempotency" ON public.purchase_idempotency;
CREATE POLICY "Users read own purchase_idempotency" ON public.purchase_idempotency
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No direct client inserts — SECURITY DEFINER RPC only

-- Drop prior overloads so PostgREST binds a single function
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text);
DROP FUNCTION IF EXISTS public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_idempotency_key text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new_balance numeric;
  v_current_balance numeric;
  v_order_id uuid;
  v_item jsonb;
  v_offer_price numeric;
  v_offer_active boolean;
  v_qty integer;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
  v_item_count integer := 0;
  v_idem text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_replay_order uuid;
  v_replay_status text;
  v_replay_ref text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'Admins cannot purchase for themselves';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(p_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) < 1 THEN
    RAISE EXCEPTION 'Cart is empty';
  END IF;

  IF jsonb_array_length(p_items) > 20 THEN
    RAISE EXCEPTION 'Too many items in cart (max 20)';
  END IF;

  -- One checkout at a time per user (double-tab / bot multi-click)
  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Safe retry: same idempotency key returns original order (no second charge)
  IF v_idem IS NOT NULL THEN
    SELECT pi.order_id, o.status, o.payment_reference, p.balance, COALESCE(p.dev_test_balance, 0)
    INTO v_replay_order, v_replay_status, v_replay_ref, v_new_balance, v_dev_test_balance
    FROM public.purchase_idempotency pi
    JOIN public.orders o ON o.id = pi.order_id
    JOIN public.profiles p ON p.id = p_user_id
    WHERE pi.user_id = p_user_id AND pi.key = v_idem;

    IF v_replay_order IS NOT NULL THEN
      RETURN jsonb_build_object(
        'orderId', v_replay_order,
        'newBalance', v_new_balance,
        'devTestBalance', v_dev_test_balance,
        'status', v_replay_status,
        'reference', v_replay_ref,
        'idempotentReplay', true
      );
    END IF;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_item_count := v_item_count + 1;
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    SELECT price, COALESCE(active, true)
    INTO v_offer_price, v_offer_active
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    IF v_offer_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Offer inactive: %', v_item->>'offer_id';
    END IF;

    IF ABS(v_offer_price - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_offer_price, v_item->>'price';
    END IF;

    v_server_total := v_server_total + (v_offer_price * v_qty);
  END LOOP;

  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    SELECT balance, dev_test_balance
    INTO v_current_balance, v_dev_test_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
      RAISE EXCEPTION 'User profile not found';
    END IF;

    IF v_current_balance < p_total THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    v_new_balance := v_current_balance - p_total;
    v_dev_test_balance := GREATEST(0, v_dev_test_balance - p_total);

    PERFORM set_config('echocore.allow_balance_change', '1', true);

    UPDATE profiles
    SET
      balance = v_new_balance,
      dev_test_balance = v_dev_test_balance
    WHERE id = p_user_id;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    SELECT COALESCE(sam_wallet_mode, 'manual') INTO v_wallet_mode
    FROM store_settings WHERE id = 1;

    IF p_payment_method = 'ShamCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_shamcash_wallet_identifier IS NOT NULL
            AND length(trim(sam_shamcash_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API ShamCash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT shamcash_enabled
            AND shamcash_qr_image_url IS NOT NULL
            AND length(trim(shamcash_qr_image_url)) > 0
            AND shamcash_pay_code IS NOT NULL
            AND length(trim(shamcash_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual ShamCash payment is not configured yet';
        END IF;

        v_reference := 'ECHOCORE-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    ELSIF p_payment_method = 'SyriatelCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_syriatel_wallet_identifier IS NOT NULL
            AND length(trim(sam_syriatel_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Sam API Syriatel Cash payment is not configured yet';
        END IF;
      ELSE
        SELECT COALESCE((
          SELECT syriatel_enabled
            AND syriatel_qr_image_url IS NOT NULL
            AND length(trim(syriatel_qr_image_url)) > 0
            AND syriatel_pay_code IS NOT NULL
            AND length(trim(syriatel_pay_code)) > 0
          FROM store_settings WHERE id = 1
        ), false) INTO v_method_ready;

        IF NOT v_method_ready THEN
          RAISE EXCEPTION 'Manual Syriatel Cash payment is not configured yet';
        END IF;

        v_reference := 'ECHOCORE-ORD-' || upper(substr(replace(p_user_id::text, '-', ''), 1, 6))
          || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));
      END IF;
    END IF;
  END IF;

  INSERT INTO orders (user_id, total, payment_method, status, payment_reference)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status, v_reference)
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));
    INSERT INTO order_items (
      order_id,
      offer_id,
      name_snapshot,
      price,
      quantity,
      player_uid,
      player_server,
      player_charname
    )
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      v_qty,
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, '')),
      NULLIF(v_item->>'player_charname', '')
    );
  END LOOP;

  IF v_idem IS NOT NULL THEN
    INSERT INTO public.purchase_idempotency (user_id, key, order_id)
    VALUES (p_user_id, v_idem, v_order_id)
    ON CONFLICT (user_id, key) DO NOTHING;
  END IF;

  IF p_payment_method = 'balance' AND v_order_status = 'completed' THEN
    PERFORM public.notify_user(
      p_user_id,
      'purchase_completed',
      jsonb_build_object(
        'orderId', v_order_id,
        'total', p_total,
        'newBalance', v_new_balance
      ),
      '/success?orderId=' || v_order_id::text
    );
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance,
    'status', v_order_status,
    'reference', v_reference
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text, text) TO authenticated;

-- Keep 6-arg overload compatible if PostgREST still binds older form
-- (Postgres allows both if defaults differ — we only expose the 7-arg form above)
