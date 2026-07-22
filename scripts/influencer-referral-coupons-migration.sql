-- =============================================================================
-- Influencer referral codes: % off public price for buyers + % commission to
-- influencer wallet. Replaces fixed wallet-credit coupons.
-- Apply: supabase db query --linked -f scripts/influencer-referral-coupons-migration.sql
-- =============================================================================

-- Coupon columns for referral model
ALTER TABLE public.influencer_coupons
  ADD COLUMN IF NOT EXISTS discount_percent numeric(8,3),
  ADD COLUMN IF NOT EXISTS influencer_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- amount_usd was required for old model — relax for referral codes
ALTER TABLE public.influencer_coupons
  ALTER COLUMN amount_usd DROP NOT NULL;

UPDATE public.influencer_coupons
SET discount_percent = 3
WHERE discount_percent IS NULL;

ALTER TABLE public.influencer_coupons
  ALTER COLUMN discount_percent SET DEFAULT 3;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'influencer_coupons_discount_percent_check'
  ) THEN
    ALTER TABLE public.influencer_coupons
      ADD CONSTRAINT influencer_coupons_discount_percent_check
      CHECK (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 50));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS influencer_coupons_influencer_idx
  ON public.influencer_coupons (influencer_user_id)
  WHERE influencer_user_id IS NOT NULL;

-- Buyer binds a code on their profile
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS influencer_coupon_id uuid REFERENCES public.influencer_coupons(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_influencer_coupon_idx
  ON public.profiles (influencer_coupon_id)
  WHERE influencer_coupon_id IS NOT NULL;

-- Track commission per order (idempotent)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS influencer_coupon_id uuid REFERENCES public.influencer_coupons(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS influencer_commission_usd numeric(12,2),
  ADD COLUMN IF NOT EXISTS influencer_commission_paid_at timestamptz;

-- ---------------------------------------------------------------------------
-- Price helper: public * (1 - pct/100), never below supplier cost, never above public
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.influencer_price_from_public(
  p_public numeric,
  p_discount_percent numeric,
  p_cost numeric DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_public numeric := COALESCE(p_public, 0);
  v_pct numeric := COALESCE(p_discount_percent, 0);
  v_cost numeric := COALESCE(p_cost, 0);
  v_price numeric;
BEGIN
  IF v_public <= 0 THEN
    RETURN NULL;
  END IF;
  IF v_pct <= 0 THEN
    RETURN ceil(v_public * 100) / 100.0;
  END IF;
  v_price := v_public * (1 - v_pct / 100.0);
  v_price := ceil(v_price * 100) / 100.0;
  IF v_cost > 0 AND v_price < v_cost THEN
    v_price := ceil(v_cost * 100) / 100.0;
  END IF;
  IF v_price > v_public THEN
    v_price := ceil(v_public * 100) / 100.0;
  END IF;
  IF v_price < 0.01 THEN
    v_price := 0.01;
  END IF;
  RETURN v_price;
END;
$$;

-- ---------------------------------------------------------------------------
-- Admin create / update coupon
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_influencer_coupon(
  p_code text,
  p_discount_percent numeric DEFAULT 3,
  p_influencer_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_code text;
  v_row public.influencer_coupons%ROWTYPE;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');

  IF v_code = '' OR length(v_code) < 3 OR length(v_code) > 32 OR v_code !~ '^[A-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid coupon code';
  END IF;

  IF p_discount_percent IS NULL OR p_discount_percent < 0 OR p_discount_percent > 50 THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 50';
  END IF;

  IF p_influencer_user_id IS NULL THEN
    RAISE EXCEPTION 'Influencer user is required';
  END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = p_influencer_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Influencer user not found';
  END IF;
  IF v_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot assign admin as influencer';
  END IF;

  INSERT INTO public.influencer_coupons (
    code, discount_percent, influencer_user_id, note, expires_at, amount_usd, created_by, is_active
  ) VALUES (
    v_code,
    round(p_discount_percent, 3),
    p_influencer_user_id,
    nullif(trim(p_note), ''),
    p_expires_at,
    NULL,
    auth.uid(),
    true
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Coupon code already exists';
END;
$$;

-- Drop old signature if present (amount-based)
DROP FUNCTION IF EXISTS public.admin_create_influencer_coupon(text, numeric, integer, integer, timestamptz, text);

REVOKE EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, uuid, text, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_influencer_coupon(
  p_coupon_id uuid,
  p_discount_percent numeric DEFAULT NULL,
  p_influencer_user_id uuid DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_is_active boolean DEFAULT NULL,
  p_clear_expires boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.influencer_coupons%ROWTYPE;
  v_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_discount_percent IS NOT NULL AND (p_discount_percent < 0 OR p_discount_percent > 50) THEN
    RAISE EXCEPTION 'Discount percent must be between 0 and 50';
  END IF;

  IF p_influencer_user_id IS NOT NULL THEN
    SELECT role INTO v_role FROM public.profiles WHERE id = p_influencer_user_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Influencer user not found';
    END IF;
    IF v_role = 'admin' THEN
      RAISE EXCEPTION 'Cannot assign admin as influencer';
    END IF;
  END IF;

  UPDATE public.influencer_coupons
  SET
    discount_percent = COALESCE(p_discount_percent, discount_percent),
    influencer_user_id = COALESCE(p_influencer_user_id, influencer_user_id),
    note = CASE WHEN p_note IS NULL THEN note ELSE nullif(trim(p_note), '') END,
    expires_at = CASE
      WHEN p_clear_expires THEN NULL
      WHEN p_expires_at IS NOT NULL THEN p_expires_at
      ELSE expires_at
    END,
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now()
  WHERE id = p_coupon_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_influencer_coupon(uuid, numeric, uuid, text, timestamptz, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_update_influencer_coupon(uuid, numeric, uuid, text, timestamptz, boolean, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_list_influencer_coupons(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_lim integer := GREATEST(1, LEAST(200, COALESCE(p_limit, 50)));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.created_at DESC)
    FROM (
      SELECT
        c.id,
        c.code,
        c.discount_percent,
        c.influencer_user_id,
        c.note,
        c.expires_at,
        c.is_active,
        c.redemption_count,
        c.created_at,
        c.updated_at,
        p.username AS influencer_username,
        p.name AS influencer_name
      FROM public.influencer_coupons c
      LEFT JOIN public.profiles p ON p.id = c.influencer_user_id
      ORDER BY c.created_at DESC
      LIMIT v_lim
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_influencer_coupons(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_influencer_coupons(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Customer applies code (binds to profile — not wallet top-up)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_influencer_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_coupon public.influencer_coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');
  IF v_code = '' THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE upper(code) = v_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  IF v_coupon.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;

  IF v_coupon.influencer_user_id IS NULL THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  -- Influencer cannot use their own code
  IF v_coupon.influencer_user_id = v_uid THEN
    RAISE EXCEPTION 'coupon_own_code';
  END IF;

  -- Partners already have plan-B pricing; still allow bind for commission path only if not partner?
  -- Prefer partner pricing over influencer; bind is still ok for when they lose partner status.

  UPDATE public.profiles
  SET influencer_coupon_id = v_coupon.id
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'code', v_coupon.code,
    'discountPercent', v_coupon.discount_percent,
    'couponId', v_coupon.id
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_influencer_coupon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_influencer_coupon(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.clear_my_influencer_coupon()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.profiles SET influencer_coupon_id = NULL WHERE id = auth.uid();
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_my_influencer_coupon() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_my_influencer_coupon() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_influencer_coupon()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_coupon public.influencer_coupons%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_coupon
  FROM public.profiles p
  JOIN public.influencer_coupons c ON c.id = p.influencer_coupon_id
  WHERE p.id = v_uid
    AND c.is_active = true
    AND (c.expires_at IS NULL OR c.expires_at >= now())
    AND c.influencer_user_id IS DISTINCT FROM v_uid
    AND c.discount_percent IS NOT NULL
    AND c.discount_percent > 0;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_coupon.id,
    'code', v_coupon.code,
    'discountPercent', v_coupon.discount_percent,
    'note', v_coupon.note
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_influencer_coupon() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_influencer_coupon() TO authenticated;

-- ---------------------------------------------------------------------------
-- Pay influencer commission once per completed order
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pay_influencer_commission_for_order(p_order_id uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_coupon public.influencer_coupons%ROWTYPE;
  v_public_total numeric := 0;
  v_commission numeric := 0;
  v_new_bal numeric;
  v_item record;
  v_public numeric;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed' THEN
    RETURN 0;
  END IF;

  IF v_order.influencer_commission_paid_at IS NOT NULL THEN
    RETURN COALESCE(v_order.influencer_commission_usd, 0);
  END IF;

  IF v_order.influencer_coupon_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE id = v_order.influencer_coupon_id
  FOR UPDATE;

  IF NOT FOUND OR v_coupon.influencer_user_id IS NULL THEN
    RETURN 0;
  END IF;

  -- Do not pay commission to the buyer themselves
  IF v_coupon.influencer_user_id = v_order.user_id THEN
    RETURN 0;
  END IF;

  -- Commission = discount% of public shelf price × qty (at order time from offer table)
  FOR v_item IN
    SELECT oi.quantity, o.price AS public_price
    FROM public.order_items oi
    JOIN public.offers o ON o.id = oi.offer_id
    WHERE oi.order_id = p_order_id
  LOOP
    v_public := COALESCE(v_item.public_price, 0);
    IF v_public > 0 THEN
      v_public_total := v_public_total + (v_public * GREATEST(1, COALESCE(v_item.quantity, 1)));
    END IF;
  END LOOP;

  v_commission := round(v_public_total * (COALESCE(v_coupon.discount_percent, 0) / 100.0), 2);
  IF v_commission < 0.01 THEN
    UPDATE public.orders
    SET influencer_commission_usd = 0, influencer_commission_paid_at = now()
    WHERE id = p_order_id;
    RETURN 0;
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_commission
  WHERE id = v_coupon.influencer_user_id
  RETURNING balance INTO v_new_bal;

  IF v_new_bal IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  ) VALUES (
    v_coupon.influencer_user_id,
    'adjustment',
    v_commission,
    v_new_bal,
    'influencer_commission',
    'INF-' || v_coupon.code || '-' || left(p_order_id::text, 8),
    'completed'
  );

  UPDATE public.orders
  SET
    influencer_commission_usd = v_commission,
    influencer_commission_paid_at = now()
  WHERE id = p_order_id;

  UPDATE public.influencer_coupons
  SET redemption_count = COALESCE(redemption_count, 0) + 1, updated_at = now()
  WHERE id = v_coupon.id;

  PERFORM public.notify_user(
    v_coupon.influencer_user_id,
    'influencer_commission',
    jsonb_build_object(
      'amount', v_commission,
      'code', v_coupon.code,
      'orderId', p_order_id,
      'newBalance', v_new_bal,
      'discountPercent', v_coupon.discount_percent
    ),
    '/profile'
  );

  RETURN v_commission;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pay_influencer_commission_for_order(uuid) FROM public;

-- ---------------------------------------------------------------------------
-- create_order_atomic: partner OR influencer pricing + commission on balance buy
-- ---------------------------------------------------------------------------
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
  v_offer_cost numeric;
  v_qty integer;
  v_expected numeric;
  v_server_total numeric := 0;
  v_order_status text;
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
  v_idem text := nullif(trim(coalesce(p_idempotency_key, '')), '');
  v_replay_order uuid;
  v_replay_status text;
  v_replay_ref text;
  v_partner_markup numeric := null;
  v_inf_coupon_id uuid := null;
  v_inf_discount numeric := null;
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

  PERFORM pg_advisory_xact_lock(hashtext(p_user_id::text));

  -- Partner tier markup (null = public / influencer pricing)
  SELECT t.markup_percent INTO v_partner_markup
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id AND t.is_active = true
  WHERE p.id = p_user_id;

  -- Influencer code only when not a partner
  IF v_partner_markup IS NULL THEN
    SELECT c.id, c.discount_percent
    INTO v_inf_coupon_id, v_inf_discount
    FROM public.profiles p
    JOIN public.influencer_coupons c ON c.id = p.influencer_coupon_id
    WHERE p.id = p_user_id
      AND c.is_active = true
      AND (c.expires_at IS NULL OR c.expires_at >= now())
      AND c.influencer_user_id IS DISTINCT FROM p_user_id
      AND c.discount_percent IS NOT NULL
      AND c.discount_percent > 0;
  END IF;

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
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));

    SELECT price, COALESCE(active, true), g2bulk_cost_usd
    INTO v_offer_price, v_offer_active, v_offer_cost
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    IF v_offer_active IS NOT TRUE THEN
      RAISE EXCEPTION 'Offer inactive: %', v_item->>'offer_id';
    END IF;

    IF v_partner_markup IS NOT NULL AND v_offer_cost IS NOT NULL AND v_offer_cost > 0 THEN
      v_expected := public.partner_price_from_cost(v_offer_cost, v_partner_markup);
      IF v_expected IS NULL OR v_expected > v_offer_price THEN
        v_expected := v_offer_price;
      END IF;
    ELSIF v_inf_discount IS NOT NULL AND v_inf_discount > 0 THEN
      v_expected := public.influencer_price_from_public(v_offer_price, v_inf_discount, v_offer_cost);
      IF v_expected IS NULL THEN
        v_expected := v_offer_price;
      END IF;
    ELSE
      v_expected := v_offer_price;
    END IF;

    IF ABS(v_expected - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_expected, v_item->>'price';
    END IF;

    v_server_total := v_server_total + (v_expected * v_qty);
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

  INSERT INTO orders (
    user_id, total, payment_method, status, payment_reference,
    influencer_coupon_id
  )
  VALUES (
    p_user_id, p_total, p_payment_method, v_order_status, v_reference,
    CASE WHEN v_partner_markup IS NULL THEN v_inf_coupon_id ELSE NULL END
  )
  RETURNING id INTO v_order_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>'quantity')::integer, 1)));
    INSERT INTO order_items (
      order_id, offer_id, name_snapshot, price, quantity,
      player_uid, player_server, player_charname
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
    -- Commission after buyer paid
    BEGIN
      PERFORM public.pay_influencer_commission_for_order(v_order_id);
    EXCEPTION
      WHEN OTHERS THEN
        NULL; -- never block purchase
    END;
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

-- Patch confirm_order_payment to pay commission when manual/API completes order
CREATE OR REPLACE FUNCTION public.confirm_order_payment(
  p_order_id uuid,
  p_reference text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_ref text;
  v_wallet_mode text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_wallet_mode = 'api'
    AND v_order.payment_method IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Manual order approval is not used in Sam API wallet mode';
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(nullif(trim(p_reference), ''), v_order.payment_reference);

  UPDATE public.orders
    SET status = 'completed'
    WHERE id = p_order_id;

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

  PERFORM public.notify_user(
    v_order.user_id,
    'order_completed',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total
    ),
    '/success?orderId=' || p_order_id::text
  );

  BEGIN
    PERFORM public.pay_influencer_commission_for_order(p_order_id);
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'completed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated;

-- Old wallet-credit redeem no longer used
DROP FUNCTION IF EXISTS public.redeem_influencer_coupon(text);
