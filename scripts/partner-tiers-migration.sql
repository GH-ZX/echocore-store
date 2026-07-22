-- =============================================================================
-- Partner / reseller tiers (cost + markup %) + 15-minute invite links
-- Plan B: partner always pays max(cost + tier%, tiny floor) — not public fixed price
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.partner_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name_en text NOT NULL,
  name_ar text NOT NULL,
  markup_percent numeric(8,3) NOT NULL CHECK (markup_percent >= 0 AND markup_percent <= 500),
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.partner_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE,
  tier_id uuid NOT NULL REFERENCES public.partner_tiers(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  note text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS partner_invites_token_idx ON public.partner_invites (token);
CREATE INDEX IF NOT EXISTS partner_invites_expires_idx ON public.partner_invites (expires_at DESC);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS partner_tier_id uuid REFERENCES public.partner_tiers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_partner_tier_idx ON public.profiles (partner_tier_id)
  WHERE partner_tier_id IS NOT NULL;

ALTER TABLE public.partner_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated read active partner tiers" ON public.partner_tiers;
CREATE POLICY "Authenticated read active partner tiers" ON public.partner_tiers
  FOR SELECT TO authenticated
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Admins manage partner tiers" ON public.partner_tiers;
CREATE POLICY "Admins manage partner tiers" ON public.partner_tiers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins manage partner invites" ON public.partner_invites;
CREATE POLICY "Admins manage partner invites" ON public.partner_invites
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Seed default tiers (safe re-run)
INSERT INTO public.partner_tiers (slug, name_en, name_ar, markup_percent, sort_order)
VALUES
  ('reseller', 'Reseller', 'تاجر / محل', 8, 10),
  ('super', 'Super partner', 'شريك سوبر', 1, 20)
ON CONFLICT (slug) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  markup_percent = EXCLUDED.markup_percent,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ---------------------------------------------------------------------------
-- Partner price helper (ceil to cents)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.partner_price_from_cost(p_cost numeric, p_markup_percent numeric)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cost numeric := COALESCE(p_cost, 0);
  v_pct numeric := COALESCE(p_markup_percent, 0);
  v_marked numeric;
BEGIN
  IF v_cost <= 0 THEN
    RETURN NULL;
  END IF;
  v_marked := v_cost * (1 + v_pct / 100.0);
  RETURN ceil(v_marked * 100) / 100.0;
END;
$$;

-- ---------------------------------------------------------------------------
-- get_my_partner_tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_partner_tier()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_tier public.partner_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT t.* INTO v_tier
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id
  WHERE p.id = v_uid
    AND t.is_active = true;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'id', v_tier.id,
    'slug', v_tier.slug,
    'nameEn', v_tier.name_en,
    'nameAr', v_tier.name_ar,
    'markupPercent', v_tier.markup_percent
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_partner_tier() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_partner_tier() TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: set user partner tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_set_user_partner_tier(
  p_user_id uuid,
  p_tier_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_tiers WHERE id = p_tier_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid partner tier';
  END IF;

  UPDATE public.profiles
  SET partner_tier_id = p_tier_id
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'userId', p_user_id, 'tierId', p_tier_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_partner_tier(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_partner_tier(uuid, uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: upsert tier
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_upsert_partner_tier(
  p_id uuid DEFAULT NULL,
  p_slug text DEFAULT NULL,
  p_name_en text DEFAULT NULL,
  p_name_ar text DEFAULT NULL,
  p_markup_percent numeric DEFAULT NULL,
  p_is_active boolean DEFAULT true,
  p_sort_order integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_slug text;
  v_row public.partner_tiers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_slug := lower(trim(COALESCE(p_slug, '')));
  IF v_slug = '' OR v_slug !~ '^[a-z][a-z0-9_-]{1,31}$' THEN
    RAISE EXCEPTION 'Invalid tier slug';
  END IF;

  IF p_markup_percent IS NULL OR p_markup_percent < 0 OR p_markup_percent > 500 THEN
    RAISE EXCEPTION 'Invalid markup percent';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.partner_tiers (slug, name_en, name_ar, markup_percent, is_active, sort_order)
    VALUES (
      v_slug,
      COALESCE(nullif(trim(p_name_en), ''), v_slug),
      COALESCE(nullif(trim(p_name_ar), ''), v_slug),
      p_markup_percent,
      COALESCE(p_is_active, true),
      COALESCE(p_sort_order, 0)
    )
    RETURNING * INTO v_row;
  ELSE
    UPDATE public.partner_tiers
    SET
      slug = v_slug,
      name_en = COALESCE(nullif(trim(p_name_en), ''), name_en),
      name_ar = COALESCE(nullif(trim(p_name_ar), ''), name_ar),
      markup_percent = p_markup_percent,
      is_active = COALESCE(p_is_active, is_active),
      sort_order = COALESCE(p_sort_order, sort_order),
      updated_at = now()
    WHERE id = p_id
    RETURNING * INTO v_row;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tier not found';
    END IF;
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_upsert_partner_tier(uuid, text, text, text, numeric, boolean, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_upsert_partner_tier(uuid, text, text, text, numeric, boolean, integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin: create invite (default 15 minutes)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_create_partner_invite(
  p_tier_id uuid,
  p_minutes integer DEFAULT 15,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token text;
  v_mins integer;
  v_row public.partner_invites%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.partner_tiers WHERE id = p_tier_id AND is_active = true) THEN
    RAISE EXCEPTION 'Invalid partner tier';
  END IF;

  v_mins := GREATEST(5, LEAST(24 * 60, COALESCE(p_minutes, 15)));
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  INSERT INTO public.partner_invites (token, tier_id, created_by, note, expires_at)
  VALUES (
    v_token,
    p_tier_id,
    auth.uid(),
    nullif(trim(p_note), ''),
    now() + make_interval(mins => v_mins)
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'token', v_row.token,
    'tierId', v_row.tier_id,
    'expiresAt', v_row.expires_at,
    'path', '/partner/join?token=' || v_row.token
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_partner_invite(uuid, integer, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_partner_invite(uuid, integer, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Accept invite (logged-in user)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.accept_partner_invite(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_inv public.partner_invites%ROWTYPE;
  v_tier public.partner_tiers%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = v_uid THEN
    -- Admins can accept for testing their non-purchase role is separate; allow tier assign
    NULL;
  END IF;

  SELECT * INTO v_inv
  FROM public.partner_invites
  WHERE token = trim(p_token)
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  IF v_inv.used_at IS NOT NULL THEN
    RAISE EXCEPTION 'invite_used';
  END IF;

  IF v_inv.expires_at < now() THEN
    RAISE EXCEPTION 'invite_expired';
  END IF;

  SELECT * INTO v_tier FROM public.partner_tiers WHERE id = v_inv.tier_id AND is_active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invite_invalid';
  END IF;

  UPDATE public.profiles
  SET partner_tier_id = v_tier.id
  WHERE id = v_uid;

  UPDATE public.partner_invites
  SET used_at = now(), used_by = v_uid
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok', true,
    'tier', jsonb_build_object(
      'id', v_tier.id,
      'slug', v_tier.slug,
      'nameEn', v_tier.name_en,
      'nameAr', v_tier.name_ar,
      'markupPercent', v_tier.markup_percent
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.accept_partner_invite(text) FROM public;
GRANT EXECUTE ON FUNCTION public.accept_partner_invite(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- create_order_atomic: partner pays cost + tier markup (plan B)
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

  -- Partner tier markup (null = public pricing)
  SELECT t.markup_percent INTO v_partner_markup
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id AND t.is_active = true
  WHERE p.id = p_user_id;

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

    -- Plan B: partners always pay cost + tier% when cost is known
    IF v_partner_markup IS NOT NULL AND v_offer_cost IS NOT NULL AND v_offer_cost > 0 THEN
      v_expected := public.partner_price_from_cost(v_offer_cost, v_partner_markup);
      -- Never charge partner more than public shelf price
      IF v_expected IS NULL OR v_expected > v_offer_price THEN
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

  INSERT INTO orders (user_id, total, payment_method, status, payment_reference)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status, v_reference)
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
