-- =============================================================================
-- ECHOCORE — MANUAL SHAMCASH RECHARGE MIGRATION
-- Run in Supabase SQL Editor after supabase_security_migration.sql
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORE SETTINGS — QR + manual pay code (public via get_payment_methods)
-- ---------------------------------------------------------------------------

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS shamcash_qr_image_url text,
  ADD COLUMN IF NOT EXISTS shamcash_pay_code text;

-- ---------------------------------------------------------------------------
-- 2. RECHARGE REQUESTS
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.recharge_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount numeric(10,2) NOT NULL CHECK (amount >= 5 AND amount <= 500),
  reference text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'payment_sent', 'approved', 'rejected', 'cancelled')),
  payment_method text NOT NULL DEFAULT 'ShamCash',
  admin_note text,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recharge_requests_user_status_idx
  ON public.recharge_requests (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS recharge_requests_status_created_idx
  ON public.recharge_requests (status, created_at DESC);

ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own recharge requests" ON public.recharge_requests;
CREATE POLICY "Users read own recharge requests" ON public.recharge_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins manage recharge requests" ON public.recharge_requests;
CREATE POLICY "Admins manage recharge requests" ON public.recharge_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. LOCK DOWN DIRECT BALANCE CREDIT — admin approval only
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.credit_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  new_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive';
  END IF;

  UPDATE public.profiles
    SET balance = COALESCE(balance, 0) + p_amount
    WHERE id = p_user_id
    RETURNING balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'recharge', p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.credit_user_balance(uuid, numeric, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. PUBLIC PAYMENT CONFIG (includes manual ShamCash QR fields)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((SELECT shamcash_enabled FROM store_settings WHERE id = 1), false),
    'binance', COALESCE((SELECT binance_enabled FROM store_settings WHERE id = 1), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'ECHOCORE Store'),
    'shamcashQrImageUrl', (SELECT shamcash_qr_image_url FROM store_settings WHERE id = 1),
    'shamcashPayCode', (SELECT shamcash_pay_code FROM store_settings WHERE id = 1),
    'shamcashManualReady', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_qr_image_url IS NOT NULL
        AND length(trim(shamcash_qr_image_url)) > 0
        AND shamcash_pay_code IS NOT NULL
        AND length(trim(shamcash_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'rechargeMin', 5,
    'rechargeMax', 500,
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. USER RECHARGE RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_recharge_request(p_amount numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(10,2);
  v_reference text;
  v_request_id uuid;
  v_manual_ready boolean;
  v_active_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount < 5 OR v_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $5 and $500';
  END IF;

  SELECT COALESCE((
    SELECT shamcash_enabled
      AND shamcash_qr_image_url IS NOT NULL
      AND length(trim(shamcash_qr_image_url)) > 0
      AND shamcash_pay_code IS NOT NULL
      AND length(trim(shamcash_pay_code)) > 0
    FROM store_settings WHERE id = 1
  ), false) INTO v_manual_ready;

  IF NOT v_manual_ready THEN
    RAISE EXCEPTION 'Manual ShamCash recharge is not configured yet';
  END IF;

  SELECT count(*)::int INTO v_active_count
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent');

  IF v_active_count >= 1 THEN
    RAISE EXCEPTION 'You already have a pending recharge request';
  END IF;

  v_reference := 'ECHOCORE-' || upper(substr(replace(v_user_id::text, '-', ''), 1, 6))
    || '-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 4));

  INSERT INTO recharge_requests (user_id, amount, reference, status, payment_method)
  VALUES (v_user_id, v_amount, v_reference, 'pending', 'ShamCash')
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'requestId', v_request_id,
    'reference', v_reference,
    'amount', v_amount,
    'status', 'pending'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'This recharge request can no longer be updated';
  END IF;

  UPDATE recharge_requests
    SET status = 'payment_sent', updated_at = now()
    WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', 'payment_sent'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_recharge_payment_sent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_recharge_payment_sent(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_my_active_recharge_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE user_id = v_user_id
    AND status IN ('pending', 'payment_sent')
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', v_row.status,
    'createdAt', v_row.created_at
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_active_recharge_request() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_active_recharge_request() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. ADMIN RECHARGE RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_admin_recharge_requests(p_status text DEFAULT 'payment_sent')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        r.id,
        r.user_id,
        r.amount,
        r.reference,
        r.status,
        r.payment_method,
        r.admin_note,
        r.created_at,
        r.updated_at,
        p.name AS user_name
      FROM recharge_requests r
      LEFT JOIN profiles p ON p.id = r.user_id
      WHERE (p_status IS NULL OR p_status = 'all' OR r.status = p_status)
      ORDER BY r.created_at DESC
      LIMIT 100
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.approve_recharge_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_new_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting approval';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_row.user_id,
    v_row.amount,
    v_row.payment_method,
    v_row.reference
  );

  UPDATE recharge_requests
    SET status = 'approved',
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.approve_recharge_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_recharge_request(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.reject_recharge_request(p_request_id uuid, p_note text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row
  FROM recharge_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Request is not awaiting review';
  END IF;

  UPDATE recharge_requests
    SET status = 'rejected',
        admin_note = nullif(trim(p_note), ''),
        reviewed_by = v_admin_id,
        reviewed_at = now(),
        updated_at = now()
    WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'status', 'rejected'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reject_recharge_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_recharge_request(uuid, text) TO authenticated;