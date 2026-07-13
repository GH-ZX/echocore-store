-- =============================================================================
-- ECHOCORE STORE â€” COMPLETE SUPABASE SETUP (single file)
-- =============================================================================
-- Version: 0.6.0 (single merged file, no duplicate RPC bodies)  |  Live site: https://www.echocore412.com
--
-- Run this ENTIRE file once in Supabase SQL Editor (new or existing project).
-- Idempotent: IF NOT EXISTS, DROP POLICY IF EXISTS, CREATE OR REPLACE.
--
-- NEW project     â†’ run all sections below, then Auth URLs + first admin.
-- EXISTING project â†’ safe to re-run; functions are deduplicated to final versions.
-- MOVE to new Supabase â†’ new project + this file + update GitHub secrets + Edge secrets.
--
-- Auth (production):
--   Site URL: https://www.echocore412.com
--   Redirects: https://www.echocore412.com/login  https://www.echocore412.com/**
--              http://localhost:5173/login
--
-- After SQL: UPDATE public.profiles SET role = 'admin' WHERE email = 'you@example.com';
-- Guide: SUPABASE_SETUP.md
--
-- TABLE OF CONTENTS
--   Â§01  Core schema, RLS, RPCs, storage & seed data
--   Â§02  Manual ShamCash recharge
--   Â§03  Manual ShamCash checkout orders
--   Â§04  In-app notifications
--   Â§05  Notifications v2 + dev mock fulfillment
--   Â§06  Dev test wallet (notifications v3)
--   Â§07  G2Bulk fulfillment
--   Â§08  G2Bulk catalog sync columns
--   Â§09  G2Bulk auto-sync (pg_cron)
--   Â§10  G2Bulk catalog health check
--   Â§11  G2Bulk live catalog mode
--   Â§12  G2Bulk pull selection
--   Â§13  G2Bulk hybrid catalog mode
--   Â§14  Game regions (parent/child variants)
--   Â§16  Sam API wallet (manual + API dual mode)
--   §17–§27  Moderation, usernames, gifts, Syriatel, Sam invoices wallet (manual + API dual mode)
--   Â§15  Catalog segments
--   Â§A/B Optional maintenance (commented, dev/staging only)
-- =============================================================================

-- =============================================================================
-- Â§01  Core schema, RLS, RPCs, storage & seed data
-- =============================================================================
-- Baseline tables, policies, checkout RPCs, product-images bucket, starter seed.

-- =====================================================
-- 1. DATABASE TABLES CREATION
-- =====================================================

-- PROFILES (Stores user roles, details, and balance)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  name text,
  avatar_url text,
  bio text,
  phone text,
  country text,
  favorite_game text,
  discord_username text,
  default_player_uid text,
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

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;


-- Confirm external payment after gateway verification (or simulated checkout in dev)

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

-- 5. Users manage own avatar files in avatars/ folder
DROP POLICY IF EXISTS "Users upload own avatar" ON storage.objects;
CREATE POLICY "Users upload own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );

DROP POLICY IF EXISTS "Users update own avatar" ON storage.objects;
CREATE POLICY "Users update own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
  );

DROP POLICY IF EXISTS "Users delete own avatar" ON storage.objects;
CREATE POLICY "Users delete own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] = 'avatars'
    AND name LIKE ('avatars/' || auth.uid()::text || '-%')
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
  ('Khaled M.', 'ØªÙˆØµÙŠÙ„ Ø³Ø±ÙŠØ¹ ÙˆØ£Ø³Ø¹Ø§Ø± Ù…Ù…ØªØ§Ø²Ø©. Ø´Ø­Ù†Øª VP Ù„ÙØ§Ù„ÙˆØ±Ø§Ù†Øª Ø®Ù„Ø§Ù„ Ø£Ù‚Ù„ Ù…Ù† Ø¯Ù‚ÙŠÙ‚Ø©.', 5, 'approved', true, 1),
  ('Sara A.', 'ÙˆØ§Ø¬Ù‡Ø© Ø§Ù„Ù…ØªØ¬Ø± Ø¬Ù…ÙŠÙ„Ø© ÙˆØ§Ù„Ø¯ÙØ¹ Ø³Ù„Ø³. ShamCash Ø§Ø´ØªØºÙ„ Ø¨Ø¯ÙˆÙ† Ø£ÙŠ Ù…Ø´ÙƒÙ„Ø©.', 5, 'approved', true, 2),
  ('Omar H.', 'Ø£ÙØ¶Ù„ Ø£Ø³Ø¹Ø§Ø± Ù„Ù‚ÙŠØªÙ‡Ø§ Ù„Ø´Ø­Ù† Ø§Ù„Ø£Ù„Ø¹Ø§Ø¨. Ø§Ù„Ø¯Ø¹Ù… Ø±Ø¯ Ø¨Ø³Ø±Ø¹Ø© Ø¹Ù„Ù‰ Ø§Ù„Ø¯ÙŠØ³ÙƒÙˆØ±Ø¯.', 5, 'approved', true, 3),
  ('Layla R.', 'Ù…ÙˆØ«ÙˆÙ‚ ÙƒÙ„ Ù…Ø±Ø©. Ø£Ø³ØªØ®Ø¯Ù… Ø§Ù„Ù…ØªØ¬Ø± Ù„Ø´Ø±Ø§Ø¡ RP ÙÙŠ Ù„ÙˆÙ„ Ø£Ø³Ø¨ÙˆØ¹ÙŠØ§Ù‹.', 5, 'approved', true, 4),
  ('Youssef K.', 'Fast delivery and fair prices. PUBG UC arrived in under a minute.', 5, 'approved', true, 5),
  ('Nour T.', 'Clean checkout, clear prices, and instant top-ups. Highly recommend.', 5, 'approved', true, 6),
  ('Rami S.', 'Ø§Ø´ØªØ±ÙŠØª Ø¨Ø·Ø§Ù‚Ø© Xbox ÙˆÙˆØµÙ„ Ø§Ù„ÙƒÙˆØ¯ ÙÙˆØ±Ø§Ù‹. ØªØ¬Ø±Ø¨Ø© Ù…Ù…ØªØ§Ø²Ø© Ù…Ù† Ø§Ù„Ø¨Ø¯Ø§ÙŠØ© Ù„Ù„Ù†Ù‡Ø§ÙŠØ©.', 5, 'approved', true, 7),
  ('Maya L.', 'Great support when I had a question about my order. Will buy again.', 5, 'approved', true, 8)
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
    'Ù…ÙˆØ¨Ø§ÙŠÙ„ Ù„ÙŠØ¬ÙŠÙ†Ø¯Ø²', 
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
      (ml_game_id, '86 Diamonds', '86 Ø£Ù„Ù…Ø§Ø³', 1.99, 'Global',
       'Quick top-up to boost your hero progress.', 'Ø´Ø­Ù† Ø³Ø±ÙŠØ¹ Ù„ØªØ·ÙˆÙŠØ± Ø£Ø¨Ø·Ø§Ù„Ùƒ.',
       true),
      (ml_game_id, '172 Diamonds', '172 Ø£Ù„Ù…Ø§Ø³', 3.99, 'Global',
       'Great value for new skins and emotes.', 'Ù‚ÙŠÙ…Ø© Ù…Ù…ØªØ§Ø²Ø© Ù„Ù„Ø¬Ù„ÙˆØ¯ ÙˆØ§Ù„Ø¥ÙŠÙ…ÙˆØ¬ÙŠ Ø§Ù„Ø¬Ø¯ÙŠØ¯Ø©.',
       true),
      (ml_game_id, '257 Diamonds', '257 Ø£Ù„Ù…Ø§Ø³', 5.99, 'Global',
       'Mid-tier diamond pack for serious players.', 'Ø­Ø²Ù…Ø© Ø£Ù„Ù…Ø§Ø³ Ù…ØªÙˆØ³Ø·Ø© Ù„Ù„Ø§Ø¹Ø¨ÙŠÙ† Ø§Ù„Ø¬Ø§Ø¯ÙŠÙ†.',
       true),
      (ml_game_id, '344 Diamonds', '344 Ø£Ù„Ù…Ø§Ø³', 7.99, 'Global',
       'Popular choice for battle passes.', 'Ø§Ù„Ø®ÙŠØ§Ø± Ø§Ù„Ø´Ø§Ø¦Ø¹ Ù„Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„Ù…Ø¹Ø§Ø±Ùƒ.',
       true),
      (ml_game_id, 'Weekly Diamond Pass', 'Ø¨Ø·Ø§Ù‚Ø© Ø§Ù„Ø£Ù„Ù…Ø§Ø³ Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ÙŠØ©', 4.99, 'Global',
       'Get daily diamonds and exclusive rewards for a week.', 'Ø§Ø­ØµÙ„ Ø¹Ù„Ù‰ Ø£Ù„Ù…Ø§Ø³ ÙŠÙˆÙ…ÙŠ ÙˆÙ…ÙƒØ§ÙØ¢Øª Ø­ØµØ±ÙŠØ© Ù„Ù…Ø¯Ø© Ø£Ø³Ø¨ÙˆØ¹.',
       true),
      (ml_game_id, 'Starlight Member', 'Ø¹Ø¶ÙˆÙŠØ© Ø³ØªØ§Ø±Ù„Ø§ÙŠØª', 9.99, 'Global',
       'Monthly pass with tons of diamonds, skins, and bonuses.', 'Ø¨Ø·Ø§Ù‚Ø© Ø´Ù‡Ø±ÙŠØ© Ù…Ù„ÙŠØ¦Ø© Ø¨Ø§Ù„Ø£Ù„Ù…Ø§Ø³ ÙˆØ§Ù„Ø¬Ù„ÙˆØ¯ ÙˆØ§Ù„Ù…ÙƒØ§ÙØ¢Øª.',
       true);
  END IF;

END $$;


-- =============================================================================
-- Â§02  Manual ShamCash recharge
-- =============================================================================
-- QR + pay code, recharge_requests, admin-only balance credit.

-- =============================================================================
-- ECHOCORE â€” MANUAL SHAMCASH RECHARGE MIGRATION
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORE SETTINGS â€” QR + manual pay code (public via get_payment_methods)
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
-- 3. LOCK DOWN DIRECT BALANCE CREDIT â€” admin approval only
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




-- ---------------------------------------------------------------------------
-- 5. USER RECHARGE RPCs
-- ---------------------------------------------------------------------------

-- (superseded create_recharge_request — see §26 append)


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


REVOKE EXECUTE ON FUNCTION public.approve_recharge_request(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.approve_recharge_request(uuid) TO authenticated;


REVOKE EXECUTE ON FUNCTION public.reject_recharge_request(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_recharge_request(uuid, text) TO authenticated;

-- =============================================================================
-- Â§03  Manual ShamCash checkout orders
-- =============================================================================
-- payment_reference, pending_payment flow, admin confirm/reject.

-- =============================================================================
-- ECHOCORE â€” MANUAL SHAMCASH ORDER PAYMENT MIGRATION
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. ORDERS â€” payment reference for ShamCash manual flow
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_reference text;

CREATE INDEX IF NOT EXISTS orders_status_payment_method_idx
  ON public.orders (status, payment_method, created_at DESC);

-- ---------------------------------------------------------------------------
-- 2. CREATE ORDER â€” server-generated reference for ShamCash
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. USER â€” mark ShamCash payment as sent (no auto-complete)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.mark_order_payment_sent(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_order_payment_sent(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. ADMIN â€” confirm or reject external order payments
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.confirm_order_payment(uuid, text) TO authenticated;


REVOKE EXECUTE ON FUNCTION public.reject_order_payment(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(uuid, text) TO authenticated;

-- =============================================================================
-- Â§04  In-app notifications
-- =============================================================================
-- notifications table, user inbox, admin alerts.

-- =============================================================================
-- ECHOCORE â€” IN-APP NOTIFICATIONS
-- Then enable Realtime for `notifications` in Dashboard â†’ Database â†’ Replication.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. NOTIFICATIONS TABLE
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_created_idx
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON public.notifications (user_id, read_at)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own notifications" ON public.notifications;
CREATE POLICY "Users read own notifications" ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Inserts/updates only via SECURITY DEFINER helpers below

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

-- ---------------------------------------------------------------------------
-- 2. INTERNAL HELPERS
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;


CREATE OR REPLACE FUNCTION public.notify_all_admins(
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin record;
  v_count int := 0;
BEGIN
  FOR v_admin IN SELECT id FROM public.profiles WHERE role = 'admin'
  LOOP
    PERFORM public.notify_user(v_admin.id, p_type, p_metadata, p_link);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_all_admins(text, jsonb, text) FROM public;

-- ---------------------------------------------------------------------------
-- 3. CLIENT RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT id, type, metadata, link, read_at, created_at
      FROM public.notifications
      WHERE user_id = v_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100))
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_notifications(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_notifications(int) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_unread_notification_count()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT count(*)::int INTO v_count
  FROM public.notifications
  WHERE user_id = v_user_id AND read_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_unread_notification_count() FROM public;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count() TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.notifications%ROWTYPE;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
    SET read_at = now()
    WHERE id = p_notification_id AND user_id = v_user_id AND read_at IS NULL
    RETURNING * INTO v_row;

  IF NOT FOUND THEN
    SELECT * INTO v_row
    FROM public.notifications
    WHERE id = p_notification_id AND user_id = v_user_id;
  END IF;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Notification not found';
  END IF;

  RETURN jsonb_build_object('id', v_row.id, 'readAt', v_row.read_at);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_notification_read(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
    SET read_at = now()
    WHERE user_id = v_user_id AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_all_notifications_read() FROM public;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read() TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. HOOK EXISTING FLOWS â€” emit notifications
-- ---------------------------------------------------------------------------


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

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;


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

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_rejected',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'note', nullif(trim(p_note), '')
    ),
    '/recharge'
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'status', 'rejected'
  );
END;
$$;


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
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
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

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'completed'
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.reject_order_payment(
  p_order_id uuid,
  p_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting review';
  END IF;

  UPDATE public.orders
    SET status = 'cancelled'
    WHERE id = p_order_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_rejected',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'note', nullif(trim(p_note), '')
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'status', 'cancelled',
    'note', nullif(trim(p_note), '')
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 5. CONTACT FORM â€” notify admins on new message
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.on_contact_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all_admins(
    'admin_contact_message',
    jsonb_build_object(
      'messageId', NEW.id,
      'name', NEW.name,
      'email', NEW.email
    ),
    '/dashboard'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contact_message_notify_admins ON public.contact_messages;
CREATE TRIGGER contact_message_notify_admins
  AFTER INSERT ON public.contact_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.on_contact_message_insert();

-- =============================================================================
-- Â§05  Notifications v2 + dev mock fulfillment
-- =============================================================================
-- clear_all_notifications, fulfillment toasts, admin_credit_test_balance.

-- =============================================================================
-- ECHOCORE â€” NOTIFICATIONS V2
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. CLEAR NOTIFICATIONS
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.notifications
  WHERE user_id = v_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_all_notifications() FROM public;
GRANT EXECUTE ON FUNCTION public.clear_all_notifications() TO authenticated;


-- ---------------------------------------------------------------------------
-- 2. USER NOTIFICATION WHEN RECHARGE SENT TO ADMIN QUEUE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_recharge_payment_sent(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
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

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_row.user_id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'currentBalance', v_current_balance
    ),
    '/recharge'
  );

  PERFORM public.notify_all_admins(
    'admin_recharge_payment_sent',
    jsonb_build_object(
      'requestId', p_request_id,
      'amount', v_row.amount,
      'reference', v_row.reference,
      'userName', COALESCE(v_user_name, 'Customer')
    ),
    '/dashboard'
  );

  RETURN jsonb_build_object(
    'requestId', p_request_id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. USER NOTIFICATION WHEN ORDER PAYMENT SENT TO ADMIN QUEUE
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mark_order_payment_sent(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_order public.orders%ROWTYPE;
  v_user_name text;
  v_current_balance numeric;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id AND user_id = v_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IS DISTINCT FROM 'pending_payment' THEN
    RAISE EXCEPTION 'Order is not awaiting payment';
  END IF;

  UPDATE public.orders
    SET status = 'payment_sent'
    WHERE id = p_order_id;

  SELECT name, balance INTO v_user_name, v_current_balance
  FROM profiles WHERE id = v_order.user_id;

  PERFORM public.notify_user(
    v_order.user_id,
    'order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'reference', v_order.payment_reference,
      'currentBalance', v_current_balance
    ),
    '/profile'
  );

  PERFORM public.notify_all_admins(
    'admin_order_payment_sent',
    jsonb_build_object(
      'orderId', p_order_id,
      'total', v_order.total,
      'reference', v_order.payment_reference,
      'userName', COALESCE(v_user_name, 'Customer')
    ),
    '/dashboard'
  );

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'reference', v_order.payment_reference,
    'total', v_order.total,
    'status', 'payment_sent',
    'currentBalance', v_current_balance
  );
END;
$$;


-- ---------------------------------------------------------------------------
-- 4. NOTIFY USER WHEN G2BULK FULFILLMENT COMPLETES
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;


-- ---------------------------------------------------------------------------
-- 5. ADMIN DEV TOOLS (testing without real G2Bulk / payments)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.admin_credit_test_balance(numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_credit_test_balance(numeric) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_mock_fulfill_order(p_order_id uuid, p_mock_code text DEFAULT null)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_has_uid boolean := false;
  v_codes jsonb;
  v_code text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'Order must be completed before mock fulfillment';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.order_items
    WHERE order_id = p_order_id AND player_uid IS NOT NULL AND length(trim(player_uid)) > 0
  ) INTO v_has_uid;

  IF v_has_uid THEN
    v_codes := NULL;
  ELSE
    v_code := COALESCE(
      nullif(trim(p_mock_code), ''),
      'TEST-' || upper(substr(replace(p_order_id::text, '-', ''), 1, 12))
    );
    v_codes := jsonb_build_array(v_code);
  END IF;

  RETURN public.apply_g2bulk_fulfillment(
    p_order_id,
    'fulfilled',
    'MOCK-DEV',
    v_codes,
    jsonb_build_object('mock', true, 'mocked_at', now()),
    NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_mock_fulfill_order(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_mock_fulfill_order(uuid, text) TO authenticated;

-- =============================================================================
-- Â§06  Dev test wallet (notifications v3)
-- =============================================================================
-- profiles.dev_test_balance, admin dev-wallet RPCs.

-- =============================================================================
-- ECHOCORE â€” NOTIFICATIONS V3 (retention, in-site inbox, dev wallet)

-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. DEV TEST BALANCE TRACKING (clear mock money reliably)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS dev_test_balance numeric NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- 2. NOTIFY USER â€” retention (in-site inbox only, no external email)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_user(
  p_user_id uuid,
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_user_id IS NULL OR p_type IS NULL OR length(trim(p_type)) = 0 THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.notifications (user_id, type, metadata, link)
  VALUES (p_user_id, p_type, COALESCE(p_metadata, '{}'::jsonb), p_link)
  RETURNING id INTO v_id;

  -- Drop read notifications older than 14 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND read_at IS NOT NULL
    AND read_at < now() - interval '14 days';

  -- Drop any notification older than 30 days
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND created_at < now() - interval '30 days';

  -- Keep only the latest 40 notifications per user
  DELETE FROM public.notifications
  WHERE user_id = p_user_id
    AND id IN (
      SELECT id
      FROM public.notifications
      WHERE user_id = p_user_id
      ORDER BY created_at DESC
      OFFSET 40
    );

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_user(uuid, text, jsonb, text) FROM public;


-- ---------------------------------------------------------------------------
-- 4. BALANCE PURCHASES — see §27 canonical create_order_atomic
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 5. DEV WALLET RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_get_dev_wallet()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_admin_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'balance', v_row.balance,
    'devTestBalance', v_row.dev_test_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_dev_wallet() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_dev_wallet() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_credit_test_balance(p_amount numeric DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_new_balance numeric;
  v_dev_test_balance numeric;
  v_amount numeric := COALESCE(p_amount, 100);
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_amount <= 0 OR v_amount > 1000 THEN
    RAISE EXCEPTION 'Test amount must be between 0.01 and 1000';
  END IF;

  v_new_balance := public.credit_user_balance(
    v_admin_id,
    v_amount,
    'test',
    'DEV-TEST-' || to_char(now(), 'YYMMDDHH24MISS')
  );

  UPDATE public.profiles
  SET dev_test_balance = dev_test_balance + v_amount
  WHERE id = v_admin_id
  RETURNING dev_test_balance INTO v_dev_test_balance;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'amount', v_amount,
    'newBalance', v_new_balance,
    'devTestBalance', v_dev_test_balance
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_clear_test_balance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_removed numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_admin_id FOR UPDATE;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  IF COALESCE(v_row.dev_test_balance, 0) <= 0 THEN
    RETURN jsonb_build_object(
      'userId', v_admin_id,
      'removed', 0,
      'newBalance', v_row.balance,
      'devTestBalance', 0
    );
  END IF;

  v_removed := LEAST(v_row.balance, v_row.dev_test_balance);

  UPDATE public.profiles
  SET
    balance = GREATEST(0, balance - v_removed),
    dev_test_balance = 0
  WHERE id = v_admin_id
  RETURNING balance, dev_test_balance INTO v_row.balance, v_row.dev_test_balance;

  IF v_removed > 0 THEN
    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (
      v_admin_id,
      'adjustment',
      -v_removed,
      v_row.balance,
      'test',
      'DEV-CLEAR-' || to_char(now(), 'YYMMDDHH24MISS'),
      'completed'
    );
  END IF;

  RETURN jsonb_build_object(
    'userId', v_admin_id,
    'removed', v_removed,
    'newBalance', v_row.balance,
    'devTestBalance', v_row.dev_test_balance
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_clear_test_balance() FROM public;
GRANT EXECUTE ON FUNCTION public.admin_clear_test_balance() TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_run_mock_purchase(
  p_offer_id uuid,
  p_mock_code text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_balance numeric;
  v_dev_test numeric;
  v_needed numeric;
  v_order_result jsonb;
  v_order_id uuid;
  v_fulfill jsonb;
  v_items jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  SELECT balance, dev_test_balance
  INTO v_balance, v_dev_test
  FROM public.profiles WHERE id = v_admin_id FOR UPDATE;

  IF v_balance < v_offer.price THEN
    v_needed := ceil((v_offer.price - v_balance) * 100) / 100;
    PERFORM public.admin_credit_test_balance(v_needed);
  END IF;

  v_items := jsonb_build_array(
    jsonb_build_object(
      'offer_id', v_offer.id,
      'name_snapshot', COALESCE(v_offer.name_en, v_offer.name_ar, 'Test offer'),
      'price', v_offer.price,
      'quantity', 1
    )
  );

  v_order_result := public.create_order_atomic(
    v_admin_id,
    v_offer.price,
    'balance',
    v_items
  );

  v_order_id := (v_order_result->>'orderId')::uuid;
  v_fulfill := public.admin_mock_fulfill_order(v_order_id, p_mock_code);

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'offerId', v_offer.id,
    'offerName', COALESCE(v_offer.name_en, v_offer.name_ar),
    'total', v_offer.price,
    'newBalance', v_order_result->'newBalance',
    'devTestBalance', v_order_result->'devTestBalance',
    'fulfillment', v_fulfill,
    'receiptPath', '/success?orderId=' || v_order_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) TO authenticated;

-- =============================================================================
-- Â§07  G2Bulk fulfillment
-- =============================================================================
-- API key storage, offer/game links, apply_g2bulk_fulfillment.

-- =============================================================================
-- ECHOCORE â€” G2BULK FULFILLMENT MIGRATION
-- API key: save via Admin â†’ G2Bulk (never commit the key to git)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STORE SETTINGS â€” G2Bulk config (admin-only via RLS)
-- ---------------------------------------------------------------------------

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS g2bulk_api_key text,
  ADD COLUMN IF NOT EXISTS g2bulk_markup_percent numeric(5,2) NOT NULL DEFAULT 15;

-- ---------------------------------------------------------------------------
-- 2. GAMES â€” link to G2Bulk game code for direct top-ups
-- ---------------------------------------------------------------------------

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS g2bulk_game_code text;

-- ---------------------------------------------------------------------------
-- 3. OFFERS â€” link to G2Bulk catalogue or voucher product
-- ---------------------------------------------------------------------------

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS g2bulk_type text CHECK (g2bulk_type IS NULL OR g2bulk_type IN ('topup', 'voucher')),
  ADD COLUMN IF NOT EXISTS g2bulk_catalogue_name text,
  ADD COLUMN IF NOT EXISTS g2bulk_product_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_cost_usd numeric(10,4);

-- ---------------------------------------------------------------------------
-- 4. ORDERS â€” fulfillment tracking
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fulfillment_status text NOT NULL DEFAULT 'pending'
    CHECK (fulfillment_status IN ('pending', 'skipped', 'fulfilling', 'fulfilled', 'failed')),
  ADD COLUMN IF NOT EXISTS g2bulk_order_id text,
  ADD COLUMN IF NOT EXISTS g2bulk_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS orders_fulfillment_status_idx
  ON public.orders (fulfillment_status, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. ORDER ITEMS â€” delivered codes / payload
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS delivery_items jsonb,
  ADD COLUMN IF NOT EXISTS fulfillment_status text
    CHECK (fulfillment_status IS NULL OR fulfillment_status IN ('pending', 'fulfilling', 'fulfilled', 'failed'));

-- ---------------------------------------------------------------------------
-- 6. ADMIN â€” read G2Bulk settings (includes api key for admin UI only)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.get_g2bulk_settings() FROM public;
GRANT EXECUTE ON FUNCTION public.get_g2bulk_settings() TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. ADMIN â€” save G2Bulk settings (omit api key field to keep existing)
-- ---------------------------------------------------------------------------


REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Persist fulfillment result (edge function uses service role)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_g2bulk_fulfillment(
  p_order_id uuid,
  p_fulfillment_status text,
  p_g2bulk_order_id text DEFAULT null,
  p_delivery_items jsonb DEFAULT null,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_error text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_meta jsonb;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  v_meta := COALESCE(v_order.g2bulk_metadata, '{}'::jsonb) || COALESCE(p_metadata, '{}'::jsonb);
  IF p_error IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('last_error', p_error, 'failed_at', now());
  END IF;

  UPDATE public.orders
  SET
    fulfillment_status = p_fulfillment_status,
    g2bulk_order_id = COALESCE(p_g2bulk_order_id, g2bulk_order_id),
    g2bulk_metadata = v_meta
  WHERE id = p_order_id;

  UPDATE public.order_items
  SET
    fulfillment_status = p_fulfillment_status,
    delivery_items = COALESCE(p_delivery_items, delivery_items)
  WHERE order_id = p_order_id;

  RETURN jsonb_build_object(
    'orderId', p_order_id,
    'fulfillmentStatus', p_fulfillment_status,
    'g2bulkOrderId', p_g2bulk_order_id,
    'deliveryItems', p_delivery_items
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) FROM public;
GRANT EXECUTE ON FUNCTION public.apply_g2bulk_fulfillment(uuid, text, text, jsonb, jsonb, text) TO service_role;

-- =============================================================================
-- Â§08  G2Bulk catalog sync columns
-- =============================================================================
-- catalog_source, g2bulk sync metadata on games/offers.

-- =============================================================================
-- ECHOCORE â€” G2BULK CATALOG SYNC MIGRATION

-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_catalog_only boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS g2bulk_last_sync_at timestamptz;

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS redemption_method text DEFAULT 'uid'
    CHECK (redemption_method IS NULL OR redemption_method IN ('uid', 'redeem_code', 'both')),
  ADD COLUMN IF NOT EXISTS catalog_source text NOT NULL DEFAULT 'manual'
    CHECK (catalog_source IN ('manual', 'g2bulk')),
  ADD COLUMN IF NOT EXISTS g2bulk_source_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_synced_at timestamptz;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS catalog_source text NOT NULL DEFAULT 'manual'
    CHECK (catalog_source IN ('manual', 'g2bulk')),
  ADD COLUMN IF NOT EXISTS g2bulk_catalogue_id integer,
  ADD COLUMN IF NOT EXISTS g2bulk_synced_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS games_g2bulk_game_code_uidx
  ON public.games (g2bulk_game_code)
  WHERE g2bulk_game_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_g2bulk_product_uidx
  ON public.offers (g2bulk_product_id)
  WHERE g2bulk_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS offers_game_catalogue_uidx
  ON public.offers (game_id, g2bulk_catalogue_name)
  WHERE g2bulk_catalogue_name IS NOT NULL;

-- Storefront flag (public)



-- Admin G2Bulk settings (extended)


REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean) TO authenticated;

-- =============================================================================
-- Â§09  G2Bulk auto-sync (pg_cron)
-- =============================================================================
-- Optional cron; requires pg_cron + Edge Function secrets.

-- =============================================================================
-- ECHOCORE â€” G2BULK DAILY AUTO-SYNC (5:00 AM)

-- =============================================================================

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_hour smallint NOT NULL DEFAULT 5
    CHECK (g2bulk_auto_sync_hour >= 0 AND g2bulk_auto_sync_hour <= 23),
  ADD COLUMN IF NOT EXISTS g2bulk_auto_sync_timezone text NOT NULL DEFAULT 'Asia/Damascus',
  ADD COLUMN IF NOT EXISTS g2bulk_sync_state jsonb;

-- Admin settings (extended)

DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean);


REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text) TO authenticated;

-- -----------------------------------------------------------------------------
-- pg_cron: invoke g2bulk-sync-cron every 2 minutes
-- Requires: pg_cron + pg_net extensions (enabled on Supabase hosted)
-- Before running: store the same secret in Vault AND Edge Function secrets:
--   select vault.create_secret('YOUR_RANDOM_CRON_SECRET', 'g2bulk_cron_secret');
--   supabase secrets set G2BULK_CRON_SECRET=YOUR_RANDOM_CRON_SECRET
-- -----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'g2bulk-auto-sync-tick') THEN
    PERFORM cron.unschedule('g2bulk-auto-sync-tick');
  END IF;

  PERFORM cron.schedule(
    'g2bulk-auto-sync-tick',
    '*/2 * * * *',
    $job$
    SELECT net.http_post(
      url := 'https://uaiirtgzqtnrvcrlxstg.supabase.co/functions/v1/g2bulk-sync-cron',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-g2bulk-cron-secret', (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'g2bulk_cron_secret'
          LIMIT 1
        )
      ),
      body := '{}'::jsonb
    ) AS request_id;
    $job$
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'vault.decrypted_secrets not found â€” create g2bulk_cron_secret in Vault, then re-run the cron.schedule block.';
  WHEN OTHERS THEN
    RAISE NOTICE 'Could not schedule g2bulk auto-sync cron: %', SQLERRM;
END;
$cron$;

-- =============================================================================
-- Â§10  G2Bulk catalog health check
-- =============================================================================
-- Last check timestamp and summary JSON.

-- G2Bulk catalog health check â€” last check time + summary for admin UI

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS g2bulk_check_summary jsonb;


-- =============================================================================
-- Â§11  G2Bulk live catalog mode
-- =============================================================================
-- sync vs live catalog_mode on store_settings.

-- G2Bulk catalog mode: sync (database) vs live (API browse)
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_catalog_mode text NOT NULL DEFAULT 'sync'
    CHECK (g2bulk_catalog_mode IN ('sync', 'live'));





DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text);

DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text);
DROP FUNCTION IF EXISTS public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text);

CREATE OR REPLACE FUNCTION public.save_g2bulk_settings(
  p_enabled boolean,
  p_markup_percent numeric DEFAULT 15,
  p_api_key text DEFAULT null,
  p_catalog_only boolean DEFAULT null,
  p_auto_sync_enabled boolean DEFAULT null,
  p_auto_sync_hour smallint DEFAULT null,
  p_auto_sync_timezone text DEFAULT null,
  p_catalog_mode text DEFAULT null,
  p_charm_pricing_enabled boolean DEFAULT null,
  p_auto_approve boolean DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $
DECLARE
  v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    g2bulk_enabled = COALESCE(p_enabled, false),
    g2bulk_markup_percent = COALESCE(p_markup_percent, 15),
    g2bulk_charm_pricing_enabled = COALESCE(p_charm_pricing_enabled, g2bulk_charm_pricing_enabled, false),
    g2bulk_catalog_only = COALESCE(p_catalog_only, g2bulk_catalog_only, true),
    g2bulk_catalog_mode = COALESCE(nullif(trim(p_catalog_mode), ''), g2bulk_catalog_mode, 'sync'),
    g2bulk_auto_sync_enabled = COALESCE(p_auto_sync_enabled, g2bulk_auto_sync_enabled, true),
    g2bulk_auto_sync_hour = COALESCE(p_auto_sync_hour, g2bulk_auto_sync_hour, 5),
    g2bulk_auto_sync_timezone = COALESCE(nullif(trim(p_auto_sync_timezone), ''), g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    g2bulk_auto_approve = COALESCE(p_auto_approve, g2bulk_auto_approve, true),
    g2bulk_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE g2bulk_api_key
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_g2bulk_settings();
END;
$;

REVOKE EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_g2bulk_settings(boolean, numeric, text, boolean, boolean, smallint, text, text, boolean, boolean) TO authenticated;

-- =============================================================================
-- Â§12  G2Bulk pull selection
-- =============================================================================
-- Admin-selected subset of pulled catalog.

-- G2Bulk selective pull: store which games/accounts to sync + carousel picks
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_charm_pricing_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_pull_selection jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_auto_approve boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.get_g2bulk_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.g2bulk_api_key), '');

  RETURN jsonb_build_object(
    'g2bulk_enabled', COALESCE(v_row.g2bulk_enabled, false),
    'g2bulk_markup_percent', COALESCE(v_row.g2bulk_markup_percent, 15),
    'g2bulk_charm_pricing_enabled', COALESCE(v_row.g2bulk_charm_pricing_enabled, false),
    'g2bulk_catalog_only', COALESCE(v_row.g2bulk_catalog_only, true),
    'g2bulk_catalog_mode', COALESCE(v_row.g2bulk_catalog_mode, 'sync'),
    'g2bulk_last_sync_at', v_row.g2bulk_last_sync_at,
    'g2bulk_last_check_at', v_row.g2bulk_last_check_at,
    'g2bulk_check_summary', COALESCE(v_row.g2bulk_check_summary, '{}'::jsonb),
    'g2bulk_auto_sync_enabled', COALESCE(v_row.g2bulk_auto_sync_enabled, true),
    'g2bulk_auto_sync_hour', COALESCE(v_row.g2bulk_auto_sync_hour, 5),
    'g2bulk_auto_sync_timezone', COALESCE(v_row.g2bulk_auto_sync_timezone, 'Asia/Damascus'),
    'g2bulk_auto_approve', COALESCE(v_row.g2bulk_auto_approve, true),
    'g2bulk_pull_selection', COALESCE(v_row.g2bulk_pull_selection, '{}'::jsonb),
    'g2bulk_api_key_set', v_key IS NOT NULL,
    'g2bulk_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || 'â€¦' || substr(v_key, length(v_key) - 3, 4)
    END
  );
END;
$$;

-- =============================================================================
-- Â§13  G2Bulk hybrid catalog mode
-- =============================================================================
-- Adds hybrid to catalog_mode check + RPC exposure.

-- Hybrid catalog mode + expose pull selection to storefront
-- Run in Supabase SQL Editor.

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_g2bulk_catalog_mode_check;

ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_g2bulk_catalog_mode_check
  CHECK (g2bulk_catalog_mode IN ('sync', 'live', 'hybrid'));

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
    'rechargeMin', 1,
    'rechargeMax', 500,
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'walletMode', COALESCE((SELECT sam_wallet_mode FROM store_settings WHERE id = 1), 'manual'),
    'samApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_wallet_identifier IS NOT NULL
        AND length(trim(sam_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samInvoiceMethod', COALESCE((SELECT sam_invoice_method FROM store_settings WHERE id = 1), 'shamcash'),
    'samInvoiceCurrency', COALESCE((SELECT sam_invoice_currency FROM store_settings WHERE id = 1), 'USD'),
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true),
    'g2bulkCatalogMode', COALESCE((SELECT g2bulk_catalog_mode FROM store_settings WHERE id = 1), 'sync'),
    'g2bulkAutoApprove', COALESCE((SELECT g2bulk_auto_approve FROM store_settings WHERE id = 1), true),
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb)
  );
$$;



-- =============================================================================
-- Â§14  Game regions (parent/child variants)
-- =============================================================================
-- parent_game_id, region_label for multi-region storefront.

-- Game region grouping: one storefront game, many G2Bulk regional variants

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS group_base_key text,
  ADD COLUMN IF NOT EXISTS parent_game_id uuid REFERENCES public.games(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS region_label text;

CREATE INDEX IF NOT EXISTS games_parent_game_id_idx
  ON public.games (parent_game_id)
  WHERE parent_game_id IS NOT NULL;

COMMENT ON COLUMN public.games.group_base_key IS 'Shared base key for G2Bulk game variants (e.g. mlbb, mlbb_global, mlbb_ru).';

CREATE INDEX IF NOT EXISTS games_storefront_idx
  ON public.games (active, catalog_source)
  WHERE parent_game_id IS NULL;

COMMENT ON COLUMN public.games.parent_game_id IS 'Storefront parent; NULL = visible game card. Children hold g2bulk_game_code.';
COMMENT ON COLUMN public.games.region_label IS 'G2Bulk catalog region for child variants (e.g. SEA, Global, Turkey).';

-- =============================================================================
-- Â§15  Catalog segments
-- =============================================================================
-- topup / gift_card / gaming_account classification.

-- Catalog segments: topup | gift_card | gaming_account
-- Platforms: Xbox, PS, iTunes, Razer Gold, Steam, Netflix, etc.

ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS catalog_segment text
    CHECK (catalog_segment IS NULL OR catalog_segment IN ('topup', 'gift_card', 'gaming_account'));

CREATE INDEX IF NOT EXISTS games_catalog_segment_idx
  ON public.games (catalog_segment)
  WHERE catalog_segment IS NOT NULL;

COMMENT ON COLUMN public.games.catalog_segment IS 'Storefront category: topup, gift_card (in-game codes), gaming_account (platform/subscription codes).';

-- Re-classify all G2Bulk voucher games from title.
UPDATE public.games
SET catalog_segment = CASE
  WHEN redemption_method <> 'redeem_code' THEN 'topup'
  WHEN lower(coalesce(name_en, name_ar, slug, '')) ~* (
    'xbox|playstation|psn|ps4|ps5|nintendo|game[[:space:]]?pass|gamepass|live[[:space:]]?gold|'
    || 'steam[[:space:]]?(wallet|card|gift|account)?|netflix|spotify|disney|hulu|prime[[:space:]]?video|'
    || 'amazon[[:space:]]?(gift|card)?|apple|itunes|app[[:space:]]?store|google[[:space:]]?play|'
    || 'razer|zgold|z[[:space:]]?gold|gold[[:space:]]?pin|paysafe|paysafecard|'
    || 'blizzard|battle\.?net|battlenet|epic[[:space:]]?games|origin|ea[[:space:]]?play|'
    || 'office|windows|chatgpt|discord[[:space:]]?nitro|vpn|subscription|membership|wallet[[:space:]]?code|store[[:space:]]?credit|account'
  ) THEN 'gaming_account'
  ELSE 'gift_card'
END
WHERE catalog_source = 'g2bulk'
  AND redemption_method = 'redeem_code';

UPDATE public.games
SET catalog_segment = 'topup'
WHERE catalog_source = 'g2bulk'
  AND redemption_method = 'uid'
  AND catalog_segment IS DISTINCT FROM 'topup';

-- =============================================================================
-- OPTIONAL MAINTENANCE SCRIPTS (commented out â€” uncomment only in dev/staging)
-- =============================================================================


-- =============================================================================
-- Â§A  OPTIONAL â€” Wipe commerce data (fresh catalog start)
-- =============================================================================
-- âš ï¸  DESTRUCTIVE. Clears orders, games, offers, user activity. Do NOT run on production with live customers.
-- >>> UNCOMMENT THE BLOCK BELOW ONLY IF YOU INTEND TO RUN IT <<<

-- 
-- -- =============================================================================
-- -- ECHOCORE â€” Fresh start (wipe storefront data, reset settings, keep schema + API key)

-- -- Then deploy g2bulk and run full catalog sync from admin (or scripts/run-full-g2bulk-sync.ps1)
-- -- =============================================================================
-- 
-- BEGIN;
-- 
-- -- Commerce & catalog (order matters for FKs)
-- DELETE FROM public.order_items;
-- DELETE FROM public.orders;
-- DELETE FROM public.offers;
-- DELETE FROM public.games;
-- 
-- -- User activity
-- DELETE FROM public.transactions;
-- 
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'recharge_requests'
--   ) THEN
--     EXECUTE 'DELETE FROM public.recharge_requests';
--   END IF;
-- 
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'notifications'
--   ) THEN
--     EXECUTE 'DELETE FROM public.notifications';
--   END IF;
-- END $$;
-- 
-- DELETE FROM public.customer_reviews;
-- 
-- DO $$
-- BEGIN
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'contact_messages'
--   ) THEN
--     EXECUTE 'DELETE FROM public.contact_messages';
--   END IF;
-- END $$;
-- 
-- -- Reset all wallet balances
-- UPDATE public.profiles SET balance = 0;
-- 
-- -- Reset store settings (keep g2bulk_api_key)
-- UPDATE public.store_settings
-- SET
--   theme = '{}'::jsonb,
--   home_layout = '[
--     {"id":"carousel","type":"carousel","enabled":true},
--     {"id":"games","type":"games","enabled":true,"title_en":"Choose a Game","title_ar":"Ø§Ø®ØªØ± Ù„Ø¹Ø¨ØªÙƒ"},
--     {"id":"sale_offers","type":"sale_offers","enabled":true,"title_en":"Sale Offers","title_ar":"Ø®ØµÙˆÙ…Ø§Øª","limit":8},
--     {"id":"suggested_offers","type":"suggested_offers","enabled":true,"title_en":"Suggested Offers","title_ar":"Ø¹Ø±ÙˆØ¶ Ù…Ù‚ØªØ±Ø­Ø©","limit":8},
--     {"id":"gift_cards","type":"gift_cards","enabled":true,"title_en":"Gift Cards & Vouchers","title_ar":"Ø¨Ø·Ø§Ù‚Ø§Øª Ø§Ù„Ù‡Ø¯Ø§ÙŠØ§","limit":6},
--     {"id":"gaming_accounts","type":"gaming_accounts","enabled":true,"title_en":"Gaming Accounts","title_ar":"Ø­Ø³Ø§Ø¨Ø§Øª Ø§Ù„Ø£Ù„Ø¹Ø§Ø¨","limit":6},
--     {"id":"customer_reviews","type":"customer_reviews","enabled":true,"title_en":"Customer Reviews","title_ar":"Ø¢Ø±Ø§Ø¡ Ø§Ù„Ø²Ø¨Ø§Ø¦Ù†","limit":8,"interval_seconds":6,"show_submit_form":true,"review_ids":[]}
--   ]'::jsonb,
--   shamcash_enabled = false,
--   shamcash_api_token = null,
--   shamcash_account_id = null,
--   shamcash_qr_image_url = null,
--   binance_enabled = false,
--   mastercard_enabled = false,
--   g2bulk_enabled = true,
--   g2bulk_catalog_only = true,
--   g2bulk_catalog_mode = 'sync',
--   g2bulk_markup_percent = COALESCE(g2bulk_markup_percent, 15),
--   g2bulk_auto_sync_enabled = COALESCE(g2bulk_auto_sync_enabled, true),
--   g2bulk_auto_sync_hour = COALESCE(g2bulk_auto_sync_hour, 5),
--   g2bulk_auto_sync_timezone = COALESCE(g2bulk_auto_sync_timezone, 'Asia/Damascus'),
--   g2bulk_last_sync_at = null,
--   g2bulk_last_check_at = null,
--   g2bulk_check_summary = '{}'::jsonb,
--   g2bulk_sync_state = null,
--   updated_at = now()
-- WHERE id = 1;
-- 
-- COMMIT;
-- 
-- DO $$
-- BEGIN
--   RAISE NOTICE 'Fresh start complete. Games/offers/orders cleared. Run G2Bulk full sync next.';
-- END $$;


-- =============================================================================
-- Â§B  OPTIONAL â€” Reset one admin test wallet
-- =============================================================================
-- âš ï¸  Clears test orders/recharges for one admin email. Dev/staging only.
-- >>> UNCOMMENT THE BLOCK BELOW ONLY IF YOU INTEND TO RUN IT <<<

-- 
-- -- =============================================================================
-- -- ECHOCORE â€” Reset admin test wallet & commerce data (fresh start)
-- -- Run in Supabase SQL Editor when you want to clear test purchases/recharges.
-- -- Default target: admin.echocore3333@gmail.com (change v_email below if needed)
-- -- =============================================================================
-- 
-- DO $$
-- DECLARE
--   v_email text := 'admin.echocore3333@gmail.com';
--   v_user_id uuid;
-- BEGIN
--   SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);
-- 
--   IF v_user_id IS NULL THEN
--     RAISE EXCEPTION 'No auth user found for email: %', v_email;
--   END IF;
-- 
--   DELETE FROM public.order_items
--   WHERE order_id IN (SELECT id FROM public.orders WHERE user_id = v_user_id);
-- 
--   DELETE FROM public.orders WHERE user_id = v_user_id;
--   DELETE FROM public.transactions WHERE user_id = v_user_id;
-- 
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'recharge_requests'
--   ) THEN
--     EXECUTE 'DELETE FROM public.recharge_requests WHERE user_id = $1' USING v_user_id;
--   END IF;
-- 
--   IF EXISTS (
--     SELECT 1 FROM information_schema.tables
--     WHERE table_schema = 'public' AND table_name = 'notifications'
--   ) THEN
--     EXECUTE 'DELETE FROM public.notifications WHERE user_id = $1' USING v_user_id;
--   END IF;
-- 
--   UPDATE public.profiles
--   SET balance = 0
--   WHERE id = v_user_id;
-- 
--   RAISE NOTICE 'Reset complete for % (user_id=%). Store wallet set to $0.00', v_email, v_user_id;
-- END;
-- $$;

-- =============================================================================
-- §16  Sam API wallet (manual + API dual mode)
-- =============================================================================
-- Sam API (sam-api.pro): ShamCash / Syriatel invoices. Keys admin-only.
-- Deploy Edge Function: supabase/functions/sam-api
-- Edge secrets (optional): SAM_API_KEY, SAM_WEBHOOK_SECRET

CREATE OR REPLACE FUNCTION public.new_sam_webhook_secret()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public
AS $$
  SELECT replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
$$;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_api_key text,
  ADD COLUMN IF NOT EXISTS sam_api_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sam_wallet_mode text NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS sam_invoice_method text NOT NULL DEFAULT 'shamcash',
  ADD COLUMN IF NOT EXISTS sam_wallet_identifier text,
  ADD COLUMN IF NOT EXISTS sam_invoice_currency text NOT NULL DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS sam_webhook_secret text;

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_wallet_mode_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_wallet_mode_check
  CHECK (sam_wallet_mode IN ('manual', 'api'));

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_method_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_invoice_method_check
  CHECK (sam_invoice_method IN ('shamcash', 'syriatel'));

ALTER TABLE public.store_settings
  DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_currency_check;
ALTER TABLE public.store_settings
  ADD CONSTRAINT store_settings_sam_invoice_currency_check
  CHECK (sam_invoice_currency IN ('USD', 'SYP', 'EUR'));

CREATE TABLE IF NOT EXISTS public.sam_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL CHECK (entity_type IN ('recharge', 'order')),
  entity_id uuid,
  sam_invoice_id text NOT NULL UNIQUE,
  payment_url text,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL CHECK (currency IN ('USD', 'SYP', 'EUR')),
  method text NOT NULL CHECK (method IN ('shamcash', 'syriatel')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'expired', 'failed', 'cancelled')),
  transaction_ref text,
  webhook_received_at timestamptz,
  paid_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sam_invoices_user_status_idx
  ON public.sam_invoices (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS sam_invoices_entity_idx
  ON public.sam_invoices (entity_type, entity_id);

ALTER TABLE public.sam_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own sam invoices" ON public.sam_invoices;
CREATE POLICY "Users read own sam invoices" ON public.sam_invoices
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Admins manage sam invoices" ON public.sam_invoices;
CREATE POLICY "Admins manage sam invoices" ON public.sam_invoices
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- (removed older get_sam_api_settings; see later definition)


REVOKE EXECUTE ON FUNCTION public.is_user_banned(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.is_user_banned(uuid) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.assert_user_not_banned(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF public.is_user_banned(p_user_id) THEN
    RAISE EXCEPTION 'Account suspended';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_user_not_banned(uuid) FROM public;


-- (removed older protect_profile_sensitive_fields; see later definition)


-- ---------------------------------------------------------------------------
-- 3. SITE STATUS (public)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_site_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'maintenanceEnabled', COALESCE(v_row.maintenance_enabled, false),
    'maintenanceMessageAr', COALESCE(v_row.maintenance_message_ar, ''),
    'maintenanceMessageEn', COALESCE(v_row.maintenance_message_en, ''),
    'maintenanceAllowAdmins', COALESCE(v_row.maintenance_allow_admins, true)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_site_status() TO anon, authenticated;


CREATE OR REPLACE FUNCTION public.admin_save_maintenance_settings(
  p_enabled boolean,
  p_message_ar text DEFAULT '',
  p_message_en text DEFAULT '',
  p_allow_admins boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.store_settings
    SET maintenance_enabled = COALESCE(p_enabled, false),
        maintenance_message_ar = nullif(trim(p_message_ar), ''),
        maintenance_message_en = nullif(trim(p_message_en), ''),
        maintenance_allow_admins = COALESCE(p_allow_admins, true)
    WHERE id = 1;

  RETURN public.get_site_status();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_maintenance_settings(boolean, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_save_maintenance_settings(boolean, text, text, boolean) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. BROADCAST / DIRECT MESSAGES
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_all_users(
  p_type text,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user record;
  v_count int := 0;
BEGIN
  FOR v_user IN
    SELECT id FROM public.profiles WHERE role = 'user'
  LOOP
    PERFORM public.notify_user(v_user.id, p_type, p_metadata, p_link);
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_all_users(text, jsonb, text) FROM public;


CREATE OR REPLACE FUNCTION public.admin_broadcast_message(
  p_kind text,
  p_title text,
  p_body text,
  p_link text DEFAULT null
)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_type text;
  v_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  v_type := CASE lower(trim(p_kind))
    WHEN 'warning' THEN 'admin_warning'
    WHEN 'maintenance' THEN 'admin_maintenance_notice'
    ELSE 'admin_announcement'
  END;

  v_count := public.notify_all_users(
    v_type,
    jsonb_build_object(
      'kind', lower(trim(p_kind)),
      'title', trim(p_title),
      'body', trim(p_body)
    ),
    nullif(trim(p_link), '')
  );

  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_broadcast_message(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_broadcast_message(text, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_notify_user(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_link text DEFAULT null
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_type text;
  v_target_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF p_title IS NULL OR length(trim(p_title)) = 0 THEN
    RAISE EXCEPTION 'Title is required';
  END IF;
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'Message body is required';
  END IF;

  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target_role = 'admin' THEN
    RAISE EXCEPTION 'Cannot send moderation messages to admins';
  END IF;

  v_type := CASE lower(trim(p_kind))
    WHEN 'warning' THEN 'admin_warning'
    ELSE 'admin_announcement'
  END;

  RETURN public.notify_user(
    p_user_id,
    v_type,
    jsonb_build_object(
      'kind', lower(trim(p_kind)),
      'title', trim(p_title),
      'body', trim(p_body)
    ),
    nullif(trim(p_link), '')
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_notify_user(uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_notify_user(uuid, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. USER MODERATION RPCs
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        p.id,
        p.name,
        p.role,
        p.balance,
        p.banned_at,
        p.ban_expires_at,
        p.ban_reason,
        p.created_at,
        u.email
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.role = 'user'
        AND (
          v_search = ''
          OR lower(COALESCE(p.name, '')) LIKE '%' || v_search || '%'
          OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
        )
      ORDER BY p.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_ban_user(
  p_user_id uuid,
  p_reason text,
  p_expires_at timestamptz DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_target public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;
  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Ban reason is required';
  END IF;

  SELECT * INTO v_target FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;
  IF v_target.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot ban admin accounts';
  END IF;

  UPDATE public.profiles
    SET banned_at = now(),
        ban_expires_at = p_expires_at,
        ban_reason = trim(p_reason),
        banned_by = v_admin_id
    WHERE id = p_user_id;

  PERFORM public.notify_user(
    p_user_id,
    'account_banned',
    jsonb_build_object(
      'reason', trim(p_reason),
      'expiresAt', p_expires_at,
      'permanent', p_expires_at IS NULL
    ),
    '/banned'
  );

  RETURN jsonb_build_object(
    'userId', p_user_id,
    'bannedAt', now(),
    'banExpiresAt', p_expires_at,
    'banReason', trim(p_reason),
    'permanent', p_expires_at IS NULL
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_ban_user(uuid, text, timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_unban_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'User is required';
  END IF;

  UPDATE public.profiles
    SET banned_at = NULL,
        ban_expires_at = NULL,
        ban_reason = NULL,
        banned_by = NULL
    WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'unbanned', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unban_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unban_user(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. ENFORCE BANS IN KEY USER RPCs
-- ---------------------------------------------------------------------------

-- (removed create_recharge_request; canonical definition appended later)



-- (removed create_order_atomic; canonical definition appended later)


-- =============================================================================
-- APPEND: moderation_v2
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS verified_at timestamptz;

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS require_verified_accounts boolean NOT NULL DEFAULT false;

-- (removed older protect_profile_sensitive_fields; see later definition)



CREATE OR REPLACE FUNCTION public.get_site_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'maintenanceEnabled', COALESCE(v_row.maintenance_enabled, false),
    'maintenanceMessageAr', COALESCE(v_row.maintenance_message_ar, ''),
    'maintenanceMessageEn', COALESCE(v_row.maintenance_message_en, ''),
    'maintenanceAllowAdmins', COALESCE(v_row.maintenance_allow_admins, true),
    'requireVerifiedAccounts', COALESCE(v_row.require_verified_accounts, false)
  );
END;
$$;


CREATE OR REPLACE FUNCTION public.admin_save_site_moderation_settings(
  p_require_verified boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.store_settings
    SET require_verified_accounts = COALESCE(p_require_verified, false)
    WHERE id = 1;

  RETURN public.get_site_status();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_save_site_moderation_settings(boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_save_site_moderation_settings(boolean) TO authenticated;


CREATE OR REPLACE FUNCTION public.assert_user_verified_if_required(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_required boolean;
  v_verified_at timestamptz;
BEGIN
  SELECT COALESCE(require_verified_accounts, false)
  INTO v_required
  FROM public.store_settings
  WHERE id = 1;

  IF NOT v_required THEN
    RETURN;
  END IF;

  SELECT verified_at INTO v_verified_at
  FROM public.profiles
  WHERE id = p_user_id;

  IF v_verified_at IS NULL THEN
    RAISE EXCEPTION 'Account verification required';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.assert_user_verified_if_required(uuid) FROM public;


CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        p.id,
        p.name,
        p.role,
        p.balance,
        p.banned_at,
        p.ban_expires_at,
        p.ban_reason,
        p.verified_at,
        p.phone,
        p.country,
        p.created_at,
        u.email
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.role = 'user'
        AND (
          v_search = ''
          OR lower(COALESCE(p.name, '')) LIKE '%' || v_search || '%'
          OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
        )
      ORDER BY p.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) q
  ), '[]'::json);
END;
$$;


-- (removed older admin_get_user_profile; see later definition)


REVOKE EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_verify_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
    SET verified_at = now()
    WHERE id = p_user_id AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'verified', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_verify_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_unverify_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.profiles
    SET verified_at = NULL
    WHERE id = p_user_id AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  RETURN jsonb_build_object('userId', p_user_id, 'verified', false);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_unverify_user(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_unverify_user(uuid) TO authenticated;

-- =============================================================================
-- APPEND: moderation_v3_user_auth
-- =============================================================================

-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: username
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL AND trim(username) <> '';

CREATE OR REPLACE FUNCTION public.generate_default_username()
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_candidate text;
  v_attempt int := 0;
BEGIN
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := 'Echo_' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
    );
    IF v_attempt >= 24 THEN
      v_candidate := 'Echo_' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT;
    END IF;
  END LOOP;
  RETURN v_candidate;
END;
$$;

-- Backfill existing users with stable Echo_ + id fragment (unique per account).
UPDATE public.profiles
SET username = 'Echo_' || lower(substr(replace(id::text, '-', ''), 1, 6))
WHERE username IS NULL OR trim(username) = '';

-- Fill any remaining gaps randomly.
UPDATE public.profiles
SET username = public.generate_default_username()
WHERE username IS NULL OR trim(username) = '';

CREATE OR REPLACE FUNCTION public.profiles_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NULL OR trim(NEW.username) = '' THEN
    NEW.username := public.generate_default_username();
  END IF;

  IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
    NEW.name := NEW.username;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_before_insert_defaults ON public.profiles;
CREATE TRIGGER profiles_before_insert_defaults
  BEFORE INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.profiles_set_defaults();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, role, name)
  VALUES (
    new.id,
    'user',
    NULLIF(trim(new.raw_user_meta_data->>'name'), '')
  );
  RETURN new;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    NEW.username := OLD.username;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT
        p.id,
        p.username,
        p.name,
        p.role,
        p.balance,
        p.banned_at,
        p.ban_expires_at,
        p.ban_reason,
        p.verified_at,
        p.phone,
        p.country,
        p.created_at,
        u.email
      FROM public.profiles p
      JOIN auth.users u ON u.id = p.id
      WHERE p.role = 'user'
        AND (
          v_search = ''
          OR lower(COALESCE(p.username, '')) LIKE '%' || v_search || '%'
          OR lower(COALESCE(p.name, '')) LIKE '%' || v_search || '%'
          OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
        )
      ORDER BY p.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
    ) q
  ), '[]'::json);
END;
$$;

-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: username_change
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username_changed_at timestamptz;

CREATE OR REPLACE FUNCTION public.validate_username_format(p_username text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_value text := lower(trim(COALESCE(p_username, '')));
BEGIN
  IF v_value = '' THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  v_value := regexp_replace(v_value, '^@+', '');

  IF length(v_value) < 4 OR length(v_value) > 20 THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  IF v_value !~ '^[a-z][a-z0-9]*$' THEN
    RAISE EXCEPTION 'username_invalid';
  END IF;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.change_username(p_new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_next text;
  v_cooldown interval := interval '7 days';
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_next := public.validate_username_format(p_new_username);

  IF lower(COALESCE(v_row.username, '')) = v_next THEN
    RAISE EXCEPTION 'username_unchanged';
  END IF;

  IF v_row.username_changed_at IS NOT NULL
    AND v_row.username_changed_at + v_cooldown > now() THEN
    RAISE EXCEPTION 'username_cooldown';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = v_next
      AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  UPDATE public.profiles
  SET
    username = v_next,
    username_changed_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_next,
    'username_changed_at', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_change_username(
  p_user_id uuid,
  p_new_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_next text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_next := public.validate_username_format(p_new_username);

  IF lower(COALESCE(v_row.username, '')) = v_next THEN
    RAISE EXCEPTION 'username_unchanged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = v_next
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  UPDATE public.profiles
  SET username = v_next
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_next
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_change_username(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text) TO authenticated;

-- Include cooldown timestamp in admin profile payload
-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: admin_user_profile_fix.sql
-- =============================================================================

-- Fix: admin_get_user_profile referenced order_ref before that column exists.
-- Run this in Supabase SQL Editor if the user detail page errors on order_ref.

-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: order_ref
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS order_ref text;

CREATE UNIQUE INDEX IF NOT EXISTS orders_order_ref_unique
  ON public.orders (order_ref)
  WHERE order_ref IS NOT NULL;

CREATE SEQUENCE IF NOT EXISTS public.orders_ref_seq START 100001;

-- Backfill existing orders oldest-first so refs match chronological order.
WITH numbered AS (
  SELECT
    id,
    100000 + row_number() OVER (ORDER BY created_at ASC, id ASC) AS seq
  FROM public.orders
  WHERE order_ref IS NULL OR trim(order_ref) = ''
)
UPDATE public.orders o
SET order_ref = 'EC-' || n.seq::text
FROM numbered n
WHERE o.id = n.id;

SELECT setval(
  'public.orders_ref_seq',
  GREATEST(
    100001,
    COALESCE((
      SELECT max((regexp_replace(order_ref, '^EC-', ''))::bigint)
      FROM public.orders
      WHERE order_ref ~ '^EC-[0-9]+$'
    ), 100000) + 1
  ),
  false
);

CREATE OR REPLACE FUNCTION public.assign_order_ref()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.order_ref IS NULL OR trim(NEW.order_ref) = '' THEN
    NEW.order_ref := 'EC-' || nextval('public.orders_ref_seq')::text;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_assign_ref ON public.orders;
CREATE TRIGGER orders_assign_ref
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_ref();

-- Include order_ref in admin user profile recent orders.
-- (removed older admin_get_user_profile; see later definition)


-- =============================================================================
-- APPEND: inbox_dismiss
-- =============================================================================

CREATE OR REPLACE FUNCTION public.dismiss_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_deleted int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  DELETE FROM public.notifications
  WHERE id = p_notification_id AND user_id = v_user_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dismiss_notification(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.dismiss_notification(uuid) TO authenticated;

-- =============================================================================
-- APPEND: game_player_uids
-- =============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS game_player_uids jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.upsert_profile_game_player_uid(
  p_user_id uuid,
  p_game_id uuid,
  p_uid text,
  p_server text DEFAULT null
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid text := nullif(trim(p_uid), '');
  v_server text := nullif(trim(p_server), '');
BEGIN
  IF p_user_id IS NULL OR p_game_id IS NULL OR v_uid IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles
  SET game_player_uids = COALESCE(game_player_uids, '{}'::jsonb)
    || jsonb_build_object(
      p_game_id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'uid', v_uid,
        'server', v_server,
        'updated_at', now()
      ))
    )
  WHERE id = p_user_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.upsert_profile_game_player_uid(uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.upsert_profile_game_player_uid(uuid, uuid, text, text) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_order_items_save_game_player_uid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid;
  v_storage_game_id uuid;
  v_uid text;
  v_server text;
BEGIN
  v_uid := nullif(trim(NEW.player_uid), '');
  IF v_uid IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT o.user_id INTO v_user_id
  FROM public.orders o
  WHERE o.id = NEW.order_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(g.parent_game_id, g.id)
  INTO v_storage_game_id
  FROM public.offers off
  JOIN public.games g ON g.id = off.game_id
  WHERE off.id = NEW.offer_id;

  IF v_storage_game_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_server := nullif(trim(NEW.player_server), '');

  PERFORM public.upsert_profile_game_player_uid(
    v_user_id,
    v_storage_game_id,
    v_uid,
    v_server
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_items_save_game_player_uid ON public.order_items;
CREATE TRIGGER order_items_save_game_player_uid
  AFTER INSERT ON public.order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_order_items_save_game_player_uid();

-- Patch admin_get_user_profile to expose saved UIDs for gifting
CREATE OR REPLACE FUNCTION public.admin_get_user_profile(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_email text;
  v_order_count int;
  v_recharge_count int;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = p_user_id;

  SELECT count(*)::int INTO v_order_count
  FROM public.orders WHERE user_id = p_user_id;

  SELECT count(*)::int INTO v_recharge_count
  FROM public.recharge_requests WHERE user_id = p_user_id;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'username', v_row.username,
    'email', v_email,
    'name', v_row.name,
    'role', v_row.role,
    'balance', v_row.balance,
    'avatar_url', v_row.avatar_url,
    'bio', v_row.bio,
    'phone', v_row.phone,
    'country', v_row.country,
    'favorite_game', v_row.favorite_game,
    'discord_username', v_row.discord_username,
    'default_player_uid', v_row.default_player_uid,
    'game_player_uids', COALESCE(v_row.game_player_uids, '{}'::jsonb),
    'banned_at', v_row.banned_at,
    'ban_expires_at', v_row.ban_expires_at,
    'ban_reason', v_row.ban_reason,
    'verified_at', v_row.verified_at,
    'created_at', v_row.created_at,
    'orderCount', v_order_count,
    'rechargeCount', v_recharge_count
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_user_profile(uuid) TO authenticated;

-- =============================================================================
-- APPEND: admin_gift
-- =============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gift_message text,
  ADD COLUMN IF NOT EXISTS gift_admin_note text,
  ADD COLUMN IF NOT EXISTS gifted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 1. Block admins from purchasing for themselves via create_order_atomic
-- (removed create_order_atomic; canonical definition appended later)


REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- 2. Admin gifts a product to a user (no charge)
CREATE OR REPLACE FUNCTION public.admin_gift_order(
  p_target_user_id uuid,
  p_offer_id uuid,
  p_player_uid text DEFAULT null,
  p_player_server text DEFAULT null,
  p_gift_message text DEFAULT null,
  p_admin_note text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_target public.profiles%ROWTYPE;
  v_order_id uuid;
  v_name_snapshot text;
  v_message text;
  v_admin_name text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_target_user_id IS NULL OR p_offer_id IS NULL THEN
    RAISE EXCEPTION 'Target user and offer are required';
  END IF;

  IF p_target_user_id = v_admin_id THEN
    RAISE EXCEPTION 'Cannot gift to yourself — use dev tools for testing';
  END IF;

  SELECT * INTO v_target
  FROM public.profiles
  WHERE id = p_target_user_id;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  IF v_target.role = 'admin' THEN
    RAISE EXCEPTION 'Cannot gift to another admin account';
  END IF;

  SELECT * INTO v_offer
  FROM public.offers
  WHERE id = p_offer_id;

  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  IF v_offer.active IS FALSE THEN
    RAISE EXCEPTION 'Offer is not active';
  END IF;

  v_name_snapshot := COALESCE(v_offer.name_en, v_offer.name_ar, 'Gift offer');
  v_message := nullif(trim(p_gift_message), '');

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'ECHOCORE')
  INTO v_admin_name
  FROM public.profiles
  WHERE id = v_admin_id;

  INSERT INTO public.orders (
    user_id,
    total,
    payment_method,
    status,
    gift_message,
    gift_admin_note,
    gifted_by
  )
  VALUES (
    p_target_user_id,
    v_offer.price,
    'admin_gift',
    'completed',
    v_message,
    nullif(trim(p_admin_note), ''),
    v_admin_id
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (
    order_id,
    offer_id,
    name_snapshot,
    price,
    quantity,
    player_uid,
    player_server
  )
  VALUES (
    v_order_id,
    v_offer.id,
    v_name_snapshot,
    v_offer.price,
    1,
    nullif(trim(p_player_uid), ''),
    nullif(trim(p_player_server), '')
  );

  PERFORM public.notify_user(
    p_target_user_id,
    'order_gifted',
    jsonb_build_object(
      'orderId', v_order_id,
      'total', v_offer.price,
      'offerName', v_name_snapshot,
      'giftMessage', v_message,
      'giftedBy', v_admin_name
    ),
    '/success?orderId=' || v_order_id::text
  );

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'targetUserId', p_target_user_id,
    'offerId', v_offer.id,
    'offerName', v_name_snapshot,
    'total', v_offer.price,
    'status', 'completed',
    'giftMessage', v_message
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_gift_order(uuid, uuid, text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_gift_order(uuid, uuid, text, text, text, text) TO authenticated;

-- 3. Dev mock purchase — bypass create_order_atomic admin block
CREATE OR REPLACE FUNCTION public.admin_run_mock_purchase(
  p_offer_id uuid,
  p_mock_code text DEFAULT null
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_admin_id uuid := auth.uid();
  v_offer public.offers%ROWTYPE;
  v_balance numeric;
  v_dev_test numeric;
  v_needed numeric;
  v_order_id uuid;
  v_fulfill jsonb;
  v_new_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_offer FROM public.offers WHERE id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RAISE EXCEPTION 'Offer not found';
  END IF;

  SELECT balance, dev_test_balance
  INTO v_balance, v_dev_test
  FROM public.profiles WHERE id = v_admin_id FOR UPDATE;

  IF v_balance < v_offer.price THEN
    v_needed := ceil((v_offer.price - v_balance) * 100) / 100;
    PERFORM public.admin_credit_test_balance(v_needed);
    SELECT balance INTO v_balance FROM public.profiles WHERE id = v_admin_id;
  END IF;

  UPDATE public.profiles
  SET
    balance = balance - v_offer.price,
    dev_test_balance = GREATEST(0, dev_test_balance - v_offer.price)
  WHERE id = v_admin_id AND balance >= v_offer.price
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  INSERT INTO public.orders (user_id, total, payment_method, status)
  VALUES (v_admin_id, v_offer.price, 'balance', 'completed')
  RETURNING id INTO v_order_id;

  INSERT INTO public.order_items (order_id, offer_id, name_snapshot, price, quantity)
  VALUES (
    v_order_id,
    v_offer.id,
    COALESCE(v_offer.name_en, v_offer.name_ar, 'Test offer'),
    v_offer.price,
    1
  );

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_admin_id, 'purchase', -v_offer.price, v_new_balance, 'balance', NULL, 'completed');

  v_fulfill := public.admin_mock_fulfill_order(v_order_id, p_mock_code);

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'offerId', v_offer.id,
    'offerName', COALESCE(v_offer.name_en, v_offer.name_ar),
    'total', v_offer.price,
    'newBalance', v_new_balance,
    'devTestBalance', (SELECT dev_test_balance FROM public.profiles WHERE id = v_admin_id),
    'fulfillment', v_fulfill,
    'receiptPath', '/success?orderId=' || v_order_id::text
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_run_mock_purchase(uuid, text) TO authenticated;

-- =============================================================================
-- APPEND: syriatel_payment
-- =============================================================================

-- 1. Syriatel manual columns
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS syriatel_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS syriatel_qr_image_url text,
  ADD COLUMN IF NOT EXISTS syriatel_pay_code text;

-- 2. Dual Sam API receiving wallets (store wallets where customers pay)
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS sam_shamcash_wallet_identifier text,
  ADD COLUMN IF NOT EXISTS sam_syriatel_wallet_identifier text;

-- Migrate legacy single wallet identifier
UPDATE public.store_settings
SET
  sam_shamcash_wallet_identifier = COALESCE(
    sam_shamcash_wallet_identifier,
    CASE WHEN COALESCE(sam_invoice_method, 'shamcash') = 'shamcash' THEN sam_wallet_identifier END
  ),
  sam_syriatel_wallet_identifier = COALESCE(
    sam_syriatel_wallet_identifier,
    CASE WHEN sam_invoice_method = 'syriatel' THEN sam_wallet_identifier END
  )
WHERE id = 1;

-- 3. Recharge RPC — accept ShamCash or SyriatelCash
DROP FUNCTION IF EXISTS public.create_recharge_request(numeric);

-- (removed older create_recharge_request; see later definition)


REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text) TO authenticated;

-- 4. Order creation — SyriatelCash manual checkout
-- (removed create_order_atomic; canonical definition appended later)


-- 5. Sam API admin RPCs — dual receiving wallets
CREATE OR REPLACE FUNCTION public.get_sam_api_settings()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_key text;
  v_wh text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;
  v_key := nullif(trim(v_row.sam_api_key), '');
  v_wh := nullif(trim(v_row.sam_webhook_secret), '');

  RETURN jsonb_build_object(
    'sam_api_enabled', COALESCE(v_row.sam_api_enabled, false),
    'sam_wallet_mode', COALESCE(v_row.sam_wallet_mode, 'manual'),
    'sam_shamcash_wallet_identifier', v_row.sam_shamcash_wallet_identifier,
    'sam_syriatel_wallet_identifier', v_row.sam_syriatel_wallet_identifier,
    'sam_invoice_currency', COALESCE(v_row.sam_invoice_currency, 'USD'),
    'sam_api_key_set', v_key IS NOT NULL,
    'sam_api_key_masked', CASE
      WHEN v_key IS NULL THEN null
      WHEN length(v_key) <= 8 THEN '********'
      ELSE substr(v_key, 1, 4) || '…' || substr(v_key, length(v_key) - 3, 4)
    END,
    'sam_webhook_secret_set', v_wh IS NOT NULL,
    'sam_webhook_secret_masked', CASE
      WHEN v_wh IS NULL THEN null
      WHEN length(v_wh) <= 8 THEN '********'
      ELSE substr(v_wh, 1, 6) || '…'
    END
  );
END;
$$;

DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean,
  p_wallet_mode text DEFAULT 'manual',
  p_shamcash_wallet_identifier text DEFAULT null,
  p_syriatel_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD',
  p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF p_wallet_mode IS NOT NULL AND p_wallet_mode NOT IN ('manual', 'api') THEN
    RAISE EXCEPTION 'Invalid wallet mode';
  END IF;

  IF p_invoice_currency IS NOT NULL AND p_invoice_currency NOT IN ('USD', 'SYP', 'EUR') THEN
    RAISE EXCEPTION 'Invalid invoice currency';
  END IF;

  v_trim_key := nullif(trim(p_api_key), '');

  UPDATE public.store_settings
  SET
    sam_api_enabled = COALESCE(p_enabled, false),
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_shamcash_wallet_identifier = COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier),
    sam_syriatel_wallet_identifier = COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_api_key = CASE
      WHEN p_api_key IS NOT NULL THEN v_trim_key
      ELSE sam_api_key
    END,
    sam_webhook_secret = CASE
      WHEN p_regenerate_webhook_secret THEN encode(gen_random_bytes(24), 'hex')
      WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN encode(gen_random_bytes(24), 'hex')
      ELSE sam_webhook_secret
    END,
    updated_at = now()
  WHERE id = 1;

  RETURN public.get_sam_api_settings();
END;
$$;

REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean) TO authenticated;

-- 6. Public payment config
CREATE OR REPLACE FUNCTION public.get_payment_methods()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT json_build_object(
    'shamcash', COALESCE((SELECT shamcash_enabled FROM store_settings WHERE id = 1), false),
    'syriatel', COALESCE((SELECT syriatel_enabled FROM store_settings WHERE id = 1), false),
    'binance', COALESCE((SELECT binance_enabled FROM store_settings WHERE id = 1), false),
    'mastercard', COALESCE((SELECT mastercard_enabled FROM store_settings WHERE id = 1), false),
    'shamcashMerchantName', COALESCE((SELECT shamcash_merchant_name FROM store_settings WHERE id = 1), 'ECHOCORE Store'),
    'shamcashQrImageUrl', (SELECT shamcash_qr_image_url FROM store_settings WHERE id = 1),
    'shamcashPayCode', (SELECT shamcash_pay_code FROM store_settings WHERE id = 1),
    'syriatelQrImageUrl', (SELECT syriatel_qr_image_url FROM store_settings WHERE id = 1),
    'syriatelPayCode', (SELECT syriatel_pay_code FROM store_settings WHERE id = 1),
    'shamcashManualReady', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_qr_image_url IS NOT NULL
        AND length(trim(shamcash_qr_image_url)) > 0
        AND shamcash_pay_code IS NOT NULL
        AND length(trim(shamcash_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'syriatelManualReady', COALESCE((
      SELECT syriatel_enabled
        AND syriatel_qr_image_url IS NOT NULL
        AND length(trim(syriatel_qr_image_url)) > 0
        AND syriatel_pay_code IS NOT NULL
        AND length(trim(syriatel_pay_code)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'rechargeMin', 1,
    'rechargeMax', 500,
    'shamcashConfigured', COALESCE((
      SELECT shamcash_enabled
        AND shamcash_api_token IS NOT NULL
        AND length(trim(shamcash_api_token)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'walletMode', COALESCE((SELECT sam_wallet_mode FROM store_settings WHERE id = 1), 'manual'),
    'samShamcashApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_shamcash_wallet_identifier IS NOT NULL
        AND length(trim(sam_shamcash_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samSyriatelApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_syriatel_wallet_identifier IS NOT NULL
        AND length(trim(sam_syriatel_wallet_identifier)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
      FROM store_settings WHERE id = 1
    ), false),
    'samApiReady', COALESCE((
      SELECT sam_api_enabled
        AND sam_wallet_mode = 'api'
        AND sam_api_key IS NOT NULL
        AND length(trim(sam_api_key)) > 0
        AND sam_webhook_secret IS NOT NULL
        AND length(trim(sam_webhook_secret)) > 0
        AND (
          (sam_shamcash_wallet_identifier IS NOT NULL AND length(trim(sam_shamcash_wallet_identifier)) > 0)
          OR (sam_syriatel_wallet_identifier IS NOT NULL AND length(trim(sam_syriatel_wallet_identifier)) > 0)
        )
      FROM store_settings WHERE id = 1
    ), false),
    'samInvoiceCurrency', COALESCE((SELECT sam_invoice_currency FROM store_settings WHERE id = 1), 'USD'),
    'g2bulkCatalogOnly', COALESCE((SELECT g2bulk_catalog_only FROM store_settings WHERE id = 1), true),
    'g2bulkCatalogMode', COALESCE((SELECT g2bulk_catalog_mode FROM store_settings WHERE id = 1), 'sync'),
    'g2bulkPullSelection', COALESCE((SELECT g2bulk_pull_selection FROM store_settings WHERE id = 1), '{}'::jsonb)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_payment_methods() TO anon, authenticated;

-- =============================================================================
-- APPEND: sam_invoice_recharge
-- =============================================================================

-- 1. create_recharge_request — manual QR or Sam API mode (admin toggle)
CREATE OR REPLACE FUNCTION public.create_recharge_request(
  p_amount numeric,
  p_payment_method text DEFAULT 'ShamCash'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_amount numeric(10,2);
  v_reference text;
  v_request_id uuid;
  v_method_ready boolean;
  v_active_count int;
  v_method text := COALESCE(nullif(trim(p_payment_method), ''), 'ShamCash');
  v_wallet_mode text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  BEGIN
    PERFORM public.assert_user_not_banned(v_user_id);
    PERFORM public.assert_user_verified_if_required(v_user_id);
  EXCEPTION
    WHEN undefined_function THEN
      NULL;
  END;

  IF v_method NOT IN ('ShamCash', 'SyriatelCash') THEN
    RAISE EXCEPTION 'Invalid payment method';
  END IF;

  v_amount := round(p_amount::numeric, 2);

  IF v_amount < 1 OR v_amount > 500 THEN
    RAISE EXCEPTION 'Amount must be between $1 and $500';
  END IF;

  SELECT COALESCE(sam_wallet_mode, 'manual')
  INTO v_wallet_mode
  FROM store_settings
  WHERE id = 1;

  IF v_wallet_mode = 'api' THEN
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT shamcash_enabled
          AND sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_api_key IS NOT NULL
          AND length(trim(sam_api_key)) > 0
          AND sam_shamcash_wallet_identifier IS NOT NULL
          AND length(trim(sam_shamcash_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API ShamCash recharge is not configured yet';
      END IF;
    ELSE
      SELECT COALESCE((
        SELECT syriatel_enabled
          AND sam_api_enabled
          AND sam_wallet_mode = 'api'
          AND sam_api_key IS NOT NULL
          AND length(trim(sam_api_key)) > 0
          AND sam_syriatel_wallet_identifier IS NOT NULL
          AND length(trim(sam_syriatel_wallet_identifier)) > 0
          AND sam_webhook_secret IS NOT NULL
          AND length(trim(sam_webhook_secret)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Sam API Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
  ELSE
    IF v_method = 'ShamCash' THEN
      SELECT COALESCE((
        SELECT shamcash_enabled
          AND shamcash_qr_image_url IS NOT NULL
          AND length(trim(shamcash_qr_image_url)) > 0
          AND shamcash_pay_code IS NOT NULL
          AND length(trim(shamcash_pay_code)) > 0
        FROM store_settings WHERE id = 1
      ), false) INTO v_method_ready;
      IF NOT v_method_ready THEN
        RAISE EXCEPTION 'Manual ShamCash recharge is not configured yet';
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
        RAISE EXCEPTION 'Manual Syriatel Cash recharge is not configured yet';
      END IF;
    END IF;
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
  VALUES (v_user_id, v_amount, v_reference, 'pending', v_method)
  RETURNING id INTO v_request_id;

  RETURN jsonb_build_object(
    'requestId', v_request_id,
    'reference', v_reference,
    'amount', v_amount,
    'status', 'pending',
    'paymentMethod', v_method
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_recharge_request(numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_recharge_request(numeric, text) TO authenticated;

-- 2. Active recharge — include pending Sam invoice for API resume
CREATE OR REPLACE FUNCTION public.get_my_active_recharge_request()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row recharge_requests%ROWTYPE;
  v_invoice jsonb;
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

  SELECT jsonb_build_object(
    'samInvoiceId', si.sam_invoice_id,
    'paymentUrl', si.payment_url,
    'expiresAt', si.expires_at,
    'amount', si.amount,
    'currency', si.currency,
    'status', si.status
  )
  INTO v_invoice
  FROM sam_invoices si
  WHERE si.entity_type = 'recharge'
    AND si.entity_id = v_row.id
    AND si.status IN ('pending', 'paid')
  ORDER BY si.created_at DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'reference', v_row.reference,
    'amount', v_row.amount,
    'status', v_row.status,
    'paymentMethod', v_row.payment_method,
    'createdAt', v_row.created_at,
    'invoice', v_invoice
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_active_recharge_request() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_active_recharge_request() TO authenticated;

-- 3. Complete recharge after Sam invoice paid (service role / edge only)
CREATE OR REPLACE FUNCTION public.complete_recharge_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
  v_new_balance numeric;
  v_ref text;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'recharge' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_inv.entity_id
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
      'amount', v_row.amount,
      'newBalance', v_new_balance,
      'status', 'approved',
      'skipped', true
    );
  END IF;

  IF v_row.status NOT IN ('pending', 'payment_sent') THEN
    RAISE EXCEPTION 'Recharge request is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_row.reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.profiles
  SET balance = COALESCE(balance, 0) + v_row.amount
  WHERE id = v_row.user_id
  RETURNING balance INTO v_new_balance;

  IF v_new_balance IS NULL THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  VALUES (v_row.user_id, 'recharge', v_row.amount, v_new_balance, v_row.payment_method, v_ref, 'completed');

  UPDATE public.recharge_requests
  SET
    status = 'approved',
    reviewed_at = now(),
    updated_at = now()
  WHERE id = v_row.id;

  PERFORM public.notify_user(
    v_row.user_id,
    'recharge_approved',
    jsonb_build_object(
      'requestId', v_row.id,
      'amount', v_row.amount,
      'newBalance', v_new_balance
    ),
    '/profile'
  );

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'userId', v_row.user_id,
    'amount', v_row.amount,
    'newBalance', v_new_balance,
    'status', 'approved'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_recharge_from_sam_invoice(text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_recharge_from_sam_invoice(text) TO service_role;

-- 4. Cancel pending recharge when Sam invoice expires
CREATE OR REPLACE FUNCTION public.cancel_recharge_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_row public.recharge_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'recharge' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_a_recharge');
  END IF;

  SELECT * INTO v_row
  FROM public.recharge_requests
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Recharge request not found';
  END IF;

  IF v_row.status IN ('approved', 'rejected', 'cancelled') THEN
    RETURN jsonb_build_object(
      'requestId', v_row.id,
      'status', v_row.status,
      'skipped', true
    );
  END IF;

  UPDATE public.recharge_requests
  SET
    status = 'cancelled',
    updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object(
    'requestId', v_row.id,
    'status', 'cancelled'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_recharge_from_sam_invoice(text) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_recharge_from_sam_invoice(text) TO service_role;

-- =============================================================================
-- APPEND: sam_invoice_orders
-- =============================================================================

-- 1. create_order_atomic — API wallet mode branch
-- create_order_atomic: canonical copy in §27


REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- 2. Complete order after Sam invoice paid (service role / edge only)
CREATE OR REPLACE FUNCTION public.complete_order_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_ref text;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'order' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_an_order');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object(
      'orderId', v_order.id,
      'status', 'completed',
      'skipped', true
    );
  END IF;

  IF v_order.status NOT IN ('pending_payment', 'payment_sent') THEN
    RAISE EXCEPTION 'Order is not awaiting payment confirmation';
  END IF;

  v_ref := COALESCE(
    nullif(trim(v_inv.transaction_ref), ''),
    nullif(trim(v_order.payment_reference), ''),
    v_inv.sam_invoice_id
  );

  UPDATE public.orders
  SET
    status = 'completed',
    payment_reference = COALESCE(nullif(trim(payment_reference), ''), v_ref)
  WHERE id = v_order.id;

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
      'orderId', v_order.id,
      'total', v_order.total
    ),
    '/success?orderId=' || v_order.id::text
  );

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', 'completed'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_order_from_sam_invoice(text) FROM public;
GRANT EXECUTE ON FUNCTION public.complete_order_from_sam_invoice(text) TO service_role;

-- 3. Cancel pending order when Sam invoice expires
CREATE OR REPLACE FUNCTION public.cancel_order_from_sam_invoice(p_sam_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_inv public.sam_invoices%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  SELECT * INTO v_inv
  FROM public.sam_invoices
  WHERE sam_invoice_id = p_sam_invoice_id
  FOR UPDATE;

  IF v_inv.id IS NULL THEN
    RAISE EXCEPTION 'Invoice not found';
  END IF;

  IF v_inv.entity_type IS DISTINCT FROM 'order' OR v_inv.entity_id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'not_an_order');
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_inv.entity_id
  FOR UPDATE;

  IF v_order.id IS NULL THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'order_not_found');
  END IF;

  IF v_order.status = 'completed' THEN
    RETURN jsonb_build_object('orderId', v_order.id, 'status', 'completed', 'skipped', true);
  END IF;

  IF v_order.status IN ('pending_payment', 'payment_sent') THEN
    UPDATE public.orders SET status = 'cancelled' WHERE id = v_order.id;
  END IF;

  RETURN jsonb_build_object(
    'orderId', v_order.id,
    'status', 'cancelled'
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_from_sam_invoice(text) FROM public;
GRANT EXECUTE ON FUNCTION public.cancel_order_from_sam_invoice(text) TO service_role;

-- =============================================================================
-- §27 Canonical create_order_atomic
-- =============================================================================

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
  v_reference text := null;
  v_method_ready boolean := false;
  v_dev_test_balance numeric := 0;
  v_wallet_mode text := 'manual';
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

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_offer_price
    FROM offers
    WHERE id = (v_item->>'offer_id')::uuid;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    IF ABS(v_offer_price - (v_item->>'price')::numeric) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_offer_price, (v_item->>'price')::numeric;
    END IF;

    v_server_total := v_server_total + v_offer_price;
  END LOOP;

  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  IF p_payment_method = 'balance' THEN
    v_order_status := 'completed';

    UPDATE profiles
    SET
      balance = balance - p_total,
      dev_test_balance = GREATEST(0, dev_test_balance - p_total)
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance, dev_test_balance INTO v_new_balance, v_dev_test_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    v_order_status := 'pending_payment';
    SELECT balance, dev_test_balance
    INTO v_new_balance, v_dev_test_balance
    FROM profiles WHERE id = p_user_id;

    SELECT COALESCE(sam_wallet_mode, 'manual') INTO v_wallet_mode
    FROM store_settings WHERE id = 1;

    IF p_payment_method = 'ShamCash' THEN
      IF v_wallet_mode = 'api' THEN
        SELECT COALESCE((
          SELECT sam_api_enabled
            AND sam_wallet_mode = 'api'
            AND sam_api_key IS NOT NULL
            AND length(trim(sam_api_key)) > 0
            AND sam_shamcash_wallet_identifier IS NOT NULL
            AND length(trim(sam_shamcash_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
            AND shamcash_enabled
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
            AND sam_api_key IS NOT NULL
            AND length(trim(sam_api_key)) > 0
            AND sam_syriatel_wallet_identifier IS NOT NULL
            AND length(trim(sam_syriatel_wallet_identifier)) > 0
            AND sam_webhook_secret IS NOT NULL
            AND length(trim(sam_webhook_secret)) > 0
            AND syriatel_enabled
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
    INSERT INTO order_items (order_id, offer_id, name_snapshot, price, quantity, player_uid, player_server)
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::uuid,
      v_item->>'name_snapshot',
      (v_item->>'price')::numeric,
      COALESCE((v_item->>'quantity')::integer, 1),
      COALESCE(NULLIF(v_item->>'player_uid', ''), NULLIF(p_player_uid, '')),
      COALESCE(NULLIF(v_item->>'player_server', ''), NULLIF(p_player_server, ''))
    );
  END LOOP;

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

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(uuid, numeric, text, jsonb, text, text) TO authenticated;

-- =============================================================================
-- §28 Sam API clear-key
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean);
DROP FUNCTION IF EXISTS public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean);
CREATE OR REPLACE FUNCTION public.save_sam_api_settings(
  p_enabled boolean, p_wallet_mode text DEFAULT 'manual',
  p_shamcash_wallet_identifier text DEFAULT null, p_syriatel_wallet_identifier text DEFAULT null,
  p_invoice_currency text DEFAULT 'USD', p_api_key text DEFAULT null,
  p_regenerate_webhook_secret boolean DEFAULT false, p_clear_api_key boolean DEFAULT false
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $
DECLARE v_trim_key text;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'Unauthorized'; END IF;
  IF p_wallet_mode IS NOT NULL AND p_wallet_mode NOT IN ('manual', 'api') THEN RAISE EXCEPTION 'Invalid wallet mode'; END IF;
  IF p_invoice_currency IS NOT NULL AND p_invoice_currency NOT IN ('USD', 'SYP', 'EUR') THEN RAISE EXCEPTION 'Invalid invoice currency'; END IF;
  v_trim_key := nullif(trim(p_api_key), '');
  UPDATE public.store_settings SET
    sam_api_enabled = CASE WHEN COALESCE(p_clear_api_key, false) THEN false ELSE COALESCE(p_enabled, false) END,
    sam_wallet_mode = COALESCE(nullif(trim(p_wallet_mode), ''), sam_wallet_mode, 'manual'),
    sam_shamcash_wallet_identifier = COALESCE(nullif(trim(p_shamcash_wallet_identifier), ''), sam_shamcash_wallet_identifier),
    sam_syriatel_wallet_identifier = COALESCE(nullif(trim(p_syriatel_wallet_identifier), ''), sam_syriatel_wallet_identifier),
    sam_invoice_currency = COALESCE(nullif(trim(p_invoice_currency), ''), sam_invoice_currency, 'USD'),
    sam_api_key = CASE WHEN COALESCE(p_clear_api_key, false) THEN null WHEN p_api_key IS NOT NULL THEN v_trim_key ELSE sam_api_key END,
    sam_webhook_secret = CASE WHEN p_regenerate_webhook_secret THEN public.new_sam_webhook_secret() WHEN sam_webhook_secret IS NULL OR length(trim(sam_webhook_secret)) = 0 THEN public.new_sam_webhook_secret() ELSE sam_webhook_secret END,
    updated_at = now() WHERE id = 1;
  RETURN public.get_sam_api_settings();
END; $;
REVOKE EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean) FROM public;
GRANT EXECUTE ON FUNCTION public.save_sam_api_settings(boolean, text, text, text, text, text, boolean, boolean) TO authenticated;

-- END OF ECHOCORE SUPABASE SETUP
-- =============================================================================
