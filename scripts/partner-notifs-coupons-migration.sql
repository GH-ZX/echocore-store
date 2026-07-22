-- =============================================================================
-- Partner/verify notifications + thanks to verified users + influencer coupons
-- Apply: supabase db query --linked -f scripts/partner-notifs-coupons-migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Notify when admin verifies a user
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_verify_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_was timestamptz;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT verified_at INTO v_was
  FROM public.profiles
  WHERE id = p_user_id AND role = 'user'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET verified_at = now()
  WHERE id = p_user_id AND role = 'user';

  -- Only notify on first verification (or re-verify after unverify)
  IF v_was IS NULL THEN
    PERFORM public.notify_user(
      p_user_id,
      'account_verified',
      jsonb_build_object('verified', true),
      '/profile'
    );
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'verified', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_verify_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(uuid) TO authenticated;

-- Auto-verify after recharge: also notify when first verified
CREATE OR REPLACE FUNCTION public.mark_user_verified_after_recharge(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET verified_at = now()
  WHERE id = p_user_id
    AND role = 'user'
    AND verified_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated > 0 THEN
    PERFORM public.notify_user(
      p_user_id,
      'account_verified',
      jsonb_build_object('verified', true, 'source', 'recharge'),
      '/profile'
    );
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_user_verified_after_recharge(uuid) FROM public;

-- ---------------------------------------------------------------------------
-- 2) Notify when partner tier assigned / removed
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
DECLARE
  v_prev uuid;
  v_tier public.partner_tiers%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.partner_tiers WHERE id = p_tier_id AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Invalid partner tier';
  END IF;

  SELECT partner_tier_id INTO v_prev
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  UPDATE public.profiles
  SET partner_tier_id = p_tier_id
  WHERE id = p_user_id;

  IF p_tier_id IS NOT NULL THEN
    SELECT * INTO v_tier FROM public.partner_tiers WHERE id = p_tier_id;
    PERFORM public.notify_user(
      p_user_id,
      'partner_assigned',
      jsonb_build_object(
        'tierId', v_tier.id,
        'tierSlug', v_tier.slug,
        'tierNameEn', v_tier.name_en,
        'tierNameAr', v_tier.name_ar,
        'markupPercent', v_tier.markup_percent
      ),
      '/catalog'
    );
  ELSIF v_prev IS NOT NULL THEN
    PERFORM public.notify_user(
      p_user_id,
      'partner_removed',
      jsonb_build_object('removed', true),
      '/catalog'
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'userId', p_user_id, 'tierId', p_tier_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_partner_tier(uuid, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_user_partner_tier(uuid, uuid) TO authenticated;

-- Invite accept also notifies
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

  PERFORM public.notify_user(
    v_uid,
    'partner_assigned',
    jsonb_build_object(
      'tierId', v_tier.id,
      'tierSlug', v_tier.slug,
      'tierNameEn', v_tier.name_en,
      'tierNameAr', v_tier.name_ar,
      'markupPercent', v_tier.markup_percent,
      'source', 'invite'
    ),
    '/catalog'
  );

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

-- Soft-remove tier (deactivate); clear assignments optional stays on users until reassigned
CREATE OR REPLACE FUNCTION public.admin_delete_partner_tier(p_tier_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_users int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_tier_id IS NULL THEN
    RAISE EXCEPTION 'Tier is required';
  END IF;

  SELECT count(*)::int INTO v_users
  FROM public.profiles
  WHERE partner_tier_id = p_tier_id;

  -- Soft delete: deactivate so new assigns/invites cannot use it
  UPDATE public.partner_tiers
  SET is_active = false, updated_at = now()
  WHERE id = p_tier_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tier not found';
  END IF;

  RETURN jsonb_build_object('ok', true, 'tierId', p_tier_id, 'usersOnTier', v_users, 'deactivated', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_delete_partner_tier(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_delete_partner_tier(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Thanks message to all verified users
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_notify_verified_users(
  p_title text,
  p_body text,
  p_link text DEFAULT '/profile'
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user record;
  v_count int := 0;
  v_title text := trim(COALESCE(p_title, ''));
  v_body text := trim(COALESCE(p_body, ''));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_title = '' OR v_body = '' THEN
    RAISE EXCEPTION 'Title and body are required';
  END IF;

  FOR v_user IN
    SELECT id FROM public.profiles
    WHERE role = 'user' AND verified_at IS NOT NULL
  LOOP
    PERFORM public.notify_user(
      v_user.id,
      'verified_thanks',
      jsonb_build_object(
        'title', v_title,
        'body', v_body
      ),
      nullif(trim(p_link), '')
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_notify_verified_users(text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_notify_verified_users(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Influencer coupons (wallet credit on redeem)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.influencer_coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  amount_usd numeric(12,2) NOT NULL CHECK (amount_usd > 0 AND amount_usd <= 500),
  max_redemptions integer CHECK (max_redemptions IS NULL OR max_redemptions > 0),
  redemption_count integer NOT NULL DEFAULT 0 CHECK (redemption_count >= 0),
  per_user_limit integer NOT NULL DEFAULT 1 CHECK (per_user_limit > 0 AND per_user_limit <= 20),
  expires_at timestamptz,
  note text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS influencer_coupons_code_uidx
  ON public.influencer_coupons (upper(code));

CREATE TABLE IF NOT EXISTS public.influencer_coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES public.influencer_coupons(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount_usd numeric(12,2) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS influencer_coupon_redemptions_coupon_idx
  ON public.influencer_coupon_redemptions (coupon_id, created_at DESC);

CREATE INDEX IF NOT EXISTS influencer_coupon_redemptions_user_idx
  ON public.influencer_coupon_redemptions (user_id, created_at DESC);

ALTER TABLE public.influencer_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.influencer_coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage influencer coupons" ON public.influencer_coupons;
CREATE POLICY "Admins manage influencer coupons" ON public.influencer_coupons
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Admins read coupon redemptions" ON public.influencer_coupon_redemptions;
CREATE POLICY "Admins read coupon redemptions" ON public.influencer_coupon_redemptions
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users read own coupon redemptions" ON public.influencer_coupon_redemptions;
CREATE POLICY "Users read own coupon redemptions" ON public.influencer_coupon_redemptions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.admin_create_influencer_coupon(
  p_code text,
  p_amount_usd numeric,
  p_max_redemptions integer DEFAULT NULL,
  p_per_user_limit integer DEFAULT 1,
  p_expires_at timestamptz DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_code text;
  v_row public.influencer_coupons%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');

  IF v_code = '' OR length(v_code) < 3 OR length(v_code) > 32 OR v_code !~ '^[A-Z0-9_-]+$' THEN
    RAISE EXCEPTION 'Invalid coupon code';
  END IF;

  IF p_amount_usd IS NULL OR p_amount_usd < 0.01 OR p_amount_usd > 500 THEN
    RAISE EXCEPTION 'Amount must be between $0.01 and $500';
  END IF;

  IF p_max_redemptions IS NOT NULL AND p_max_redemptions < 1 THEN
    RAISE EXCEPTION 'Max redemptions invalid';
  END IF;

  IF p_per_user_limit IS NULL OR p_per_user_limit < 1 OR p_per_user_limit > 20 THEN
    RAISE EXCEPTION 'Per-user limit invalid';
  END IF;

  INSERT INTO public.influencer_coupons (
    code, amount_usd, max_redemptions, per_user_limit, expires_at, note, created_by
  ) VALUES (
    v_code,
    round(p_amount_usd, 2),
    p_max_redemptions,
    COALESCE(p_per_user_limit, 1),
    p_expires_at,
    nullif(trim(p_note), ''),
    auth.uid()
  )
  RETURNING * INTO v_row;

  RETURN to_jsonb(v_row);
EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Coupon code already exists';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, integer, integer, timestamptz, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_create_influencer_coupon(text, numeric, integer, integer, timestamptz, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_influencer_coupon_active(
  p_coupon_id uuid,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.influencer_coupons%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.influencer_coupons
  SET is_active = COALESCE(p_is_active, false), updated_at = now()
  WHERE id = p_coupon_id
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coupon not found';
  END IF;

  RETURN to_jsonb(v_row);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_influencer_coupon_active(uuid, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_set_influencer_coupon_active(uuid, boolean) TO authenticated;

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
    SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC)
    FROM (
      SELECT *
      FROM public.influencer_coupons
      ORDER BY created_at DESC
      LIMIT v_lim
    ) c
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_influencer_coupons(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_influencer_coupons(integer) TO authenticated;

-- Customer redeems coupon → wallet credit
CREATE OR REPLACE FUNCTION public.redeem_influencer_coupon(p_code text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_coupon public.influencer_coupons%ROWTYPE;
  v_user_uses int;
  v_new_balance numeric;
  v_old_balance numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF public.is_admin() AND auth.uid() = v_uid THEN
    -- Admins have no customer wallet use; still allow for testing if role is user only
    NULL;
  END IF;

  v_code := upper(trim(COALESCE(p_code, '')));
  v_code := regexp_replace(v_code, '\s+', '', 'g');
  IF v_code = '' THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  -- Serialize per code
  PERFORM pg_advisory_xact_lock(hashtext('coupon:' || v_code));

  SELECT * INTO v_coupon
  FROM public.influencer_coupons
  WHERE upper(code) = v_code
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'coupon_invalid';
  END IF;

  IF v_coupon.is_active IS NOT TRUE THEN
    RAISE EXCEPTION 'coupon_inactive';
  END IF;

  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at < now() THEN
    RAISE EXCEPTION 'coupon_expired';
  END IF;

  IF v_coupon.max_redemptions IS NOT NULL AND v_coupon.redemption_count >= v_coupon.max_redemptions THEN
    RAISE EXCEPTION 'coupon_exhausted';
  END IF;

  SELECT count(*)::int INTO v_user_uses
  FROM public.influencer_coupon_redemptions
  WHERE coupon_id = v_coupon.id AND user_id = v_uid;

  IF v_user_uses >= v_coupon.per_user_limit THEN
    RAISE EXCEPTION 'coupon_already_used';
  END IF;

  SELECT COALESCE(balance, 0) INTO v_old_balance
  FROM public.profiles
  WHERE id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  PERFORM set_config('echocore.allow_balance_change', '1', true);

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_coupon.amount_usd
  WHERE id = v_uid
  RETURNING balance INTO v_new_balance;

  UPDATE public.influencer_coupons
  SET redemption_count = redemption_count + 1, updated_at = now()
  WHERE id = v_coupon.id;

  INSERT INTO public.influencer_coupon_redemptions (coupon_id, user_id, amount_usd)
  VALUES (v_coupon.id, v_uid, v_coupon.amount_usd);

  INSERT INTO public.transactions (
    user_id, type, amount, balance_after, payment_method, reference, status
  ) VALUES (
    v_uid,
    'adjustment',
    v_coupon.amount_usd,
    v_new_balance,
    'coupon',
    'COUPON-' || v_coupon.code,
    'completed'
  );

  PERFORM public.notify_user(
    v_uid,
    'coupon_redeemed',
    jsonb_build_object(
      'amount', v_coupon.amount_usd,
      'code', v_coupon.code,
      'newBalance', v_new_balance,
      'note', v_coupon.note
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'ok', true,
    'amount', v_coupon.amount_usd,
    'code', v_coupon.code,
    'newBalance', v_new_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.redeem_influencer_coupon(text) FROM public;
GRANT EXECUTE ON FUNCTION public.redeem_influencer_coupon(text) TO authenticated;
