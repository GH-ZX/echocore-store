-- =============================================================================
-- ECHOCORE STORE — SUPABASE FULL SCHEMA & MIGRATION SCRIPT
-- =============================================================================
-- This file consolidates all database tables, columns, indexes, Row Level Security (RLS)
-- policies, triggers, RPC functions, storage buckets, and seed data into a single,
-- self-contained script.
--
-- Running this script in the Supabase SQL Editor will configure a new Supabase
-- project to work seamlessly with the ECHOCORE Store application.
--
-- ORDER OF EXECUTION / SETUP STEPS:
-- 1. Run this entire script in the Supabase SQL Editor.
-- 2. Go to Authentication > Providers and enable Email provider (if not enabled).
-- 3. Go to Storage and double-check that the "product-images" bucket exists and is set to PUBLIC.
-- 4. Sign up in the application using any email.
-- 5. Set your profile role to 'admin' to access the Admin dashboard:
--    UPDATE public.profiles SET role = 'admin' WHERE email = 'your-email@example.com';
--    (Or find your profile ID in the auth.users table and run):
--    UPDATE public.profiles SET role = 'admin' WHERE id = 'your-user-uuid';
-- =============================================================================

-- =====================================================
-- 1. DATABASE TABLES CREATION
-- =====================================================

-- PROFILES (Stores user roles, details, and balance)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  name text,
  balance numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- GAMES (Represents game categories / top-up systems)
CREATE TABLE IF NOT EXISTS public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name_en text NOT NULL,
  name_ar text,
  slug text NOT NULL,
  points_name text DEFAULT 'Points',
  image_url text,      -- Full cover / hero image for pages
  logo_url text,       -- Small thumbnail logo for bottom carousel strips
  description_en text,  -- Short description shown on carousel slides (EN)
  description_ar text,  -- Short description shown on carousel slides (AR)
  active boolean DEFAULT true,
  carousel_focus_x numeric(5,2) DEFAULT 50, -- Horizontal focal point (0 = left, 100 = right)
  carousel_focus_y numeric(5,2) DEFAULT 50, -- Vertical focal point (0 = top, 100 = bottom)
  carousel_order integer,                   -- Sort order in home carousel
  show_in_carousel boolean DEFAULT true,    -- Toggle carousel visibility
  servers jsonb DEFAULT '[]'::jsonb,        -- Selectable servers/regions (e.g. ["Global", "Europe"])
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS games_slug_key ON public.games (slug);

-- OFFERS (Represents price tiers and product packages for a specific game)
CREATE TABLE IF NOT EXISTS public.offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  name_en text NOT NULL,
  name_ar text,
  price numeric(10,2) NOT NULL,
  region text,
  description_en text,
  description_ar text,
  active boolean DEFAULT true,
  sale_image_url text,          -- Specific cover photo for promotional sales
  is_sale boolean DEFAULT false, -- True if offer is featured as discount / sale
  original_price numeric(10,2),  -- Crossed-out price shown during sales
  created_at timestamptz DEFAULT now()
);

-- ORDERS (Stores transaction metadata)
CREATE TABLE IF NOT EXISTS public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  total numeric(10,2) NOT NULL,
  payment_method text,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);

-- ORDER ITEMS (Stores snapshot of purchased offers with player target info)
CREATE TABLE IF NOT EXISTS public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid REFERENCES public.orders(id) ON DELETE CASCADE,
  offer_id uuid REFERENCES public.offers(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  price numeric(10,2) NOT NULL,
  quantity integer DEFAULT 1,
  player_uid text,              -- Target In-game UID provided by the buyer
  player_server text,           -- Target In-game Server/Zone selected by the buyer
  redemption_info jsonb         -- Flexible metadata for custom top-up details
);

-- TRANSACTIONS (Recharge, purchase, and refund logs)
CREATE TABLE IF NOT EXISTS public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('recharge', 'purchase', 'refund', 'adjustment')),
  amount numeric(10,2) NOT NULL,          -- Positive for recharges, negative for purchases
  balance_after numeric(10,2),           -- User balance snapshot after operation
  payment_method text,
  reference text,                        -- External payment/invoice reference ID
  status text DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
  metadata jsonb,                        -- Extra custom metadata
  created_at timestamptz DEFAULT now()
);

-- STORE SETTINGS (Global settings, themes, payment methods, and page configurations)
CREATE TABLE IF NOT EXISTS public.store_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  shamcash_enabled boolean NOT NULL DEFAULT false,
  shamcash_api_base_url text NOT NULL DEFAULT 'https://api.shamcash-api.com/v1',
  shamcash_api_token text,
  shamcash_account_id text,
  shamcash_merchant_name text DEFAULT 'ECHOCORE Store',
  binance_enabled boolean NOT NULL DEFAULT false,
  mastercard_enabled boolean NOT NULL DEFAULT false,
  theme jsonb NOT NULL DEFAULT '{}'::jsonb,
  home_layout jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- CUSTOMER REVIEWS (Stores customer testimonials displayed on the storefront)
CREATE TABLE IF NOT EXISTS public.customer_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL,
  content text NOT NULL,
  rating smallint NOT NULL DEFAULT 5 CHECK (rating BETWEEN 1 AND 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  is_seed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS customer_reviews_status_idx ON public.customer_reviews (status);
CREATE INDEX IF NOT EXISTS customer_reviews_sort_idx ON public.customer_reviews (sort_order, created_at DESC);

-- CONTACT MESSAGES (Storefront contact form submissions)
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name text,
  email text NOT NULL,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contact_messages_status_idx ON public.contact_messages (status, created_at DESC);

-- =====================================================
-- 2. ROW LEVEL SECURITY (RLS) & POLICIES
-- =====================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Helper: admin check without RLS recursion inside policies
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

-- Profiles Policies
DROP POLICY IF EXISTS "Profiles readable" ON public.profiles;
DROP POLICY IF EXISTS "Users read own profile" ON public.profiles;
CREATE POLICY "Users read own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS "Admins read all profiles" ON public.profiles;
CREATE POLICY "Admins read all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Users insert own profile" ON public.profiles;
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (
    auth.uid() = id
    AND role = 'user'
    AND balance = 0
  );

DROP POLICY IF EXISTS "Users update own" ON public.profiles;
DROP POLICY IF EXISTS "Users update own name" ON public.profiles;
CREATE POLICY "Users update own name" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admins can update profiles" ON public.profiles;
CREATE POLICY "Admins can update profiles" ON public.profiles 
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Games Policies
DROP POLICY IF EXISTS "Games public read" ON public.games;
CREATE POLICY "Games public read" ON public.games 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage games" ON public.games;
CREATE POLICY "Admins manage games" ON public.games
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Offers Policies
DROP POLICY IF EXISTS "Offers public read" ON public.offers;
CREATE POLICY "Offers public read" ON public.offers 
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage offers" ON public.offers;
CREATE POLICY "Admins manage offers" ON public.offers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Orders Policies
DROP POLICY IF EXISTS "Users own orders" ON public.orders;
CREATE POLICY "Users own orders" ON public.orders 
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Orders are created only via create_order_atomic RPC (SECURITY DEFINER)

DROP POLICY IF EXISTS "Admins view all orders" ON public.orders;
CREATE POLICY "Admins view all orders" ON public.orders 
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Order Items Policies
DROP POLICY IF EXISTS "Users view own order items" ON public.order_items;
CREATE POLICY "Users view own order items" ON public.order_items 
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.orders 
      WHERE orders.id = order_items.order_id AND orders.user_id = (SELECT auth.uid())
    )
  );

-- Order items are created only via create_order_atomic RPC (SECURITY DEFINER)

DROP POLICY IF EXISTS "Admins view all order items" ON public.order_items;
CREATE POLICY "Admins view all order items" ON public.order_items 
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Transactions Policies
DROP POLICY IF EXISTS "Users view own transactions" ON public.transactions;
CREATE POLICY "Users view own transactions" ON public.transactions 
  FOR SELECT USING ((SELECT auth.uid()) = user_id);

-- Transactions are created only via secure RPCs (SECURITY DEFINER)

DROP POLICY IF EXISTS "Admins view all transactions" ON public.transactions;
CREATE POLICY "Admins view all transactions" ON public.transactions 
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Store Settings Policies
DROP POLICY IF EXISTS "Admins manage store settings" ON public.store_settings;
CREATE POLICY "Admins manage store settings" ON public.store_settings
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Customer Reviews Policies
DROP POLICY IF EXISTS "Public read approved reviews" ON public.customer_reviews;
CREATE POLICY "Public read approved reviews" ON public.customer_reviews
  FOR SELECT USING (status = 'approved');

DROP POLICY IF EXISTS "Users submit pending reviews" ON public.customer_reviews;
CREATE POLICY "Users submit pending reviews" ON public.customer_reviews
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending' AND is_seed = false);

DROP POLICY IF EXISTS "Admins manage reviews" ON public.customer_reviews;
CREATE POLICY "Admins manage reviews" ON public.customer_reviews
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;
CREATE POLICY "Anyone can submit contact messages" ON public.contact_messages
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    char_length(email) BETWEEN 4 AND 255
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND char_length(message) BETWEEN 10 AND 5000
    AND (user_id IS NULL OR user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Admins read contact messages" ON public.contact_messages;
CREATE POLICY "Admins read contact messages" ON public.contact_messages
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "Admins update contact messages" ON public.contact_messages;
CREATE POLICY "Admins update contact messages" ON public.contact_messages
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());


-- =====================================================
-- 3. FUNCTIONS & TRIGGERS
-- =====================================================

-- Auto-create profile row on auth user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (new.id, 'user', new.raw_user_meta_data->>'name');
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public;


-- Prevent non-admins from changing role or balance on their own profile
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  caller_role text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_sensitive_fields ON public.profiles;
CREATE TRIGGER protect_profile_sensitive_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_fields();


-- Secure credit balance function (intended for Webhooks/Server Edge Functions)
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
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
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


-- Secure deduct balance function
CREATE OR REPLACE FUNCTION public.deduct_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text DEFAULT 'balance',
  p_reference text DEFAULT null
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  current_bal numeric;
  new_balance numeric;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Deduct amount must be positive';
  END IF;

  SELECT balance INTO current_bal FROM public.profiles WHERE id = p_user_id;
  IF current_bal IS NULL OR current_bal < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  UPDATE public.profiles
    SET balance = balance - p_amount
    WHERE id = p_user_id
    RETURNING balance INTO new_balance;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (p_user_id, 'purchase', -p_amount, new_balance, p_payment_method, p_reference, 'completed');

  RETURN new_balance;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.deduct_user_balance(uuid, numeric, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.deduct_user_balance(uuid, numeric, text, text) TO authenticated;


-- RPC to fetch enabled payment flags safely without exposing tokens
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
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;


-- RPC to fetch public theme variables
CREATE OR REPLACE FUNCTION public.get_site_theme()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    (SELECT theme FROM public.store_settings WHERE id = 1),
    '{}'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_site_theme() TO anon, authenticated;


-- RPC to fetch home layout settings
CREATE OR REPLACE FUNCTION public.get_home_layout()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(
    (SELECT home_layout FROM public.store_settings WHERE id = 1),
    '[]'::jsonb
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_home_layout() TO anon, authenticated;


-- RPC to fetch approved reviews ordered appropriately
CREATE OR REPLACE FUNCTION public.get_approved_customer_reviews()
RETURNS json
LANGUAGE sql
SECURITY INVOKER
STABLE AS $$
  SELECT COALESCE(
    json_agg(
      json_build_object(
        'id', id,
        'author_name', author_name,
        'content', content,
        'rating', rating,
        'created_at', created_at
      ) ORDER BY sort_order ASC, created_at DESC
    ),
    '[]'::json
  )
  FROM public.customer_reviews
  WHERE status = 'approved';
$$;

GRANT EXECUTE ON FUNCTION public.get_approved_customer_reviews() TO anon, authenticated;


-- Atomic checkout RPC (Crucial: prevents race conditions and client-side price modification)
CREATE OR REPLACE FUNCTION public.create_order_atomic(
  p_user_id uuid,
  p_total numeric,
  p_payment_method text,
  p_items jsonb,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER 
SET search_path = public AS $$
DECLARE
  v_new_balance numeric;
  v_order_id uuid;
  v_item jsonb;
  v_offer_price numeric;
  v_server_total numeric := 0;
  v_order_status text;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1. Verify each item's price against the offers table
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_offer_price
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    -- Reject if client sent a different price
    IF ABS(v_offer_price - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_offer_price, v_item->>'price';
    END IF;

    v_server_total := v_server_total + v_offer_price;
  END LOOP;

  -- Guard: total must match server-computed sum
  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  -- 2. Balance payments complete immediately; external methods stay pending
  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    UPDATE profiles
    SET balance = balance - p_total
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance INTO v_new_balance FROM profiles WHERE id = p_user_id;
  END IF;

  -- 3. Create order
  INSERT INTO orders (user_id, total, payment_method, status)
  VALUES (p_user_id, p_total, p_payment_method, v_order_status)
  RETURNING id INTO v_order_id;

  -- 4. Insert order items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, offer_id, name_snapshot, price, quantity, player_uid, player_server)
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      COALESCE((v_item->>'quantity')::integer, 1),
      NULLIF(v_item->>'player_uid', ''),
      NULLIF(v_item->>'player_server', '')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance,
    'status', v_order_status
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;


-- Confirm external payment after gateway verification (or simulated checkout in dev)
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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

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
    p_reference,
    'completed'
  FROM public.profiles p
  WHERE p.id = v_order.user_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'completed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated;


-- =====================================================
-- 4. STORAGE AUTO-CREATION & POLICIES (product-images bucket)
-- =====================================================

-- Create bucket if it does not exist (requires storage extensions enabled in Supabase)
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 1. Public read for all images (so product urls work for everyone, including anonymous visitors)
DROP POLICY IF EXISTS "Public read product-images" ON storage.objects;
CREATE POLICY "Public read product-images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

-- 2. Admin-only upload (INSERT)
DROP POLICY IF EXISTS "Admins can upload to product-images" ON storage.objects;
CREATE POLICY "Admins can upload to product-images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images' 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 3. Admin-only update (UPDATE)
DROP POLICY IF EXISTS "Admins can update product-images" ON storage.objects;
CREATE POLICY "Admins can update product-images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images' 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- 4. Admin-only delete (DELETE)
DROP POLICY IF EXISTS "Admins can delete from product-images" ON storage.objects;
CREATE POLICY "Admins can delete from product-images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images' 
    AND EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );


-- =====================================================
-- 5. SEED DATA SETUP
-- =====================================================

-- Seed initial store_settings
INSERT INTO public.store_settings (id, shamcash_enabled, binance_enabled, mastercard_enabled, theme, home_layout)
VALUES (1, false, false, false, '{}'::jsonb, '[]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Seed customer reviews
INSERT INTO public.customer_reviews (author_name, content, rating, status, is_seed, sort_order)
VALUES
  ('Khaled M.', 'توصيل سريع وأسعار ممتازة. شحنت VP لفالورانت خلال أقل من دقيقة.', 5, 'approved', true, 1),
  ('Sara A.', 'واجهة المتجر جميلة والدفع سلس. ShamCash اشتغل بدون أي مشكلة.', 5, 'approved', true, 2),
  ('Omar H.', 'أفضل أسعار لقيتها لشحن الألعاب. الدعم رد بسرعة على الديسكورد.', 5, 'approved', true, 3),
  ('Layla R.', 'موثوق كل مرة. أستخدم ECHOCORE لشراء RP في لول أسبوعياً.', 5, 'approved', true, 4)
ON CONFLICT DO NOTHING;

-- Seed Sample Game (Mobile Legends) and its Offers
DO $$
DECLARE
  ml_game_id uuid;
BEGIN
  -- Insert Mobile Legends Game
  INSERT INTO public.games (name_en, name_ar, slug, points_name, image_url, logo_url, active)
  VALUES (
    'Mobile Legends', 
    'موبايل ليجيندز', 
    'mobile-legends', 
    'Diamonds', 
    'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/mobile-legends.png',
    'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/mobile-legends-logo.png',
    true
  )
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO ml_game_id;

  -- Get existing game id if it already existed (avoid duplicate run issues)
  IF ml_game_id IS NULL THEN
    SELECT id INTO ml_game_id 
    FROM public.games 
    WHERE slug = 'mobile-legends' 
    LIMIT 1;
  END IF;

  -- Insert offers for Mobile Legends (Using simple checks to avoid duplicate seeding)
  IF NOT EXISTS (SELECT 1 FROM public.offers WHERE game_id = ml_game_id LIMIT 1) THEN
    INSERT INTO public.offers (game_id, name_en, name_ar, price, region, description_en, description_ar, active)
    VALUES 
      (ml_game_id, '86 Diamonds', '86 ألماس', 1.99, 'Global',
       'Quick top-up to boost your hero progress.', 'شحن سريع لتطوير أبطالك.',
       true),
      (ml_game_id, '172 Diamonds', '172 ألماس', 3.99, 'Global',
       'Great value for new skins and emotes.', 'قيمة ممتازة للجلود والإيموجي الجديدة.',
       true),
      (ml_game_id, '257 Diamonds', '257 ألماس', 5.99, 'Global',
       'Mid-tier diamond pack for serious players.', 'حزمة ألماس متوسطة للاعبين الجادين.',
       true),
      (ml_game_id, '344 Diamonds', '344 ألماس', 7.99, 'Global',
       'Popular choice for battle passes.', 'الخيار الشائع لبطاقات المعارك.',
       true),
      (ml_game_id, 'Weekly Diamond Pass', 'بطاقة الألماس الأسبوعية', 4.99, 'Global',
       'Get daily diamonds and exclusive rewards for a week.', 'احصل على ألماس يومي ومكافآت حصرية لمدة أسبوع.',
       true),
      (ml_game_id, 'Starlight Member', 'عضوية ستارلايت', 9.99, 'Global',
       'Monthly pass with tons of diamonds, skins, and bonuses.', 'بطاقة شهرية مليئة بالألماس والجلود والمكافآت.',
       true);
  END IF;

END $$;
