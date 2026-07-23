-- =============================================================================
-- LOCKDOWN: profiles + money tables (IDOR fix)
-- Problem: anyone who knows a user UUID can read balance + full profile.
-- Cause: RLS missing/disabled or old open policy on public.profiles.
--
-- RUN THIS in Supabase Dashboard → SQL Editor → Run
-- Then re-test in Postman with a non-admin user JWT.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Admin helper (needed by policies)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ---------------------------------------------------------------------------
-- 2) Force RLS on sensitive tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recharge_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recharge_requests FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.notifications FORCE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.sam_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sam_invoices FORCE ROW LEVEL SECURITY;

ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- 3) Drop EVERY policy on profiles, then recreate locked policies
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'profiles'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.profiles', r.policyname);
  END LOOP;
END $$;

-- Own row only (authenticated). Anon sees nothing.
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = id
    AND role = 'user'
    AND COALESCE(balance, 0) = 0
  );

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Admins update profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No DELETE for normal users
CREATE POLICY "Admins delete profiles" ON public.profiles
  FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4) Block customers from changing balance / role / username via PATCH
-- ---------------------------------------------------------------------------
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

  -- Customer editing own profile: freeze money + role + username
  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
    NEW.username := OLD.username;
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

-- ---------------------------------------------------------------------------
-- 5) Orders / transactions / recharges — own rows only
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'orders'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.orders', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own orders" ON public.orders
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all orders" ON public.orders
  FOR SELECT TO authenticated
  USING (public.is_admin());

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_items'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.order_items', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_items.order_id AND o.user_id = auth.uid()
    )
  );

CREATE POLICY "Admins read all order items" ON public.order_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'transactions'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.transactions', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins read all transactions" ON public.transactions
  FOR SELECT TO authenticated
  USING (public.is_admin());

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'recharge_requests'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.recharge_requests', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read own recharge requests" ON public.recharge_requests
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins manage recharge requests" ON public.recharge_requests
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- store_settings: admin only (API keys live here)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'store_settings'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.store_settings', r.policyname);
  END LOOP;
END $$;

CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 6) credit_user_balance must stay admin-only
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

  PERFORM set_config('echocore.allow_balance_change', '1', true);

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
-- 7) Self-check (run after; should show rowsecurity = true)
-- ---------------------------------------------------------------------------
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'orders', 'order_items', 'transactions',
    'recharge_requests', 'store_settings'
  )
ORDER BY tablename;

SELECT policyname, cmd, roles::text, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'profiles'
ORDER BY policyname;
