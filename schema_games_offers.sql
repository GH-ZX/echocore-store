-- =====================================================
-- ECHOCORE STORE - CURRENT GAMES + OFFERS SCHEMA
-- Run in Supabase SQL Editor if you reset tables or need to recreate
-- Matches the simplified admin: 
--   Game: eng name only (ar auto-filled), slug (important for redeem logic), logo_url + image_url (cover)
--   Offer: game + name_en + price + ONE description (sets both langs). NO image, NO amount.
-- =====================================================

-- 1. PROFILES (for admin role)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  name text,
  created_at timestamptz default now()
);

-- 2. GAMES
create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text,
  slug text not null,
  points_name text default 'Points',
  image_url text,      -- full cover / hero for cards + game page
  logo_url text,       -- small logo for carousel bottom thumbnails
  active boolean default true,
  created_at timestamptz default now()
);

-- Optional unique on slug
create unique index if not exists games_slug_key on public.games (slug);

-- 3. OFFERS (no amount, no main image_url on purpose; sale fields for is_sale offers)
create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(),
  game_id uuid references public.games(id) on delete cascade,
  name_en text not null,
  name_ar text,
  price numeric(10,2) not null,
  region text,
  description_en text,
  description_ar text,
  active boolean default true,
  -- Sale offer fields (added for separate sale offers + dedicated photo + crossed price)
  sale_image_url text,
  is_sale boolean default false,
  original_price numeric(10,2),
  created_at timestamptz default now()
);

-- 4. ORDERS + ITEMS (unchanged)
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  total numeric(10,2) not null,
  payment_method text,
  status text default 'completed',
  created_at timestamptz default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  offer_id uuid references public.offers(id),
  name_snapshot text not null,
  price numeric(10,2) not null,
  quantity integer default 1
);

-- =====================================================
-- ADD MISSING COLUMNS (run if you have older schema without sale fields)
-- Safe to run multiple times
-- =====================================================
ALTER TABLE public.offers 
  ADD COLUMN IF NOT EXISTS sale_image_url text,
  ADD COLUMN IF NOT EXISTS is_sale boolean default false,
  ADD COLUMN IF NOT EXISTS original_price numeric(10,2);

-- =====================================================
-- RLS (critical for admin inserts to work)
-- =====================================================
alter table public.profiles enable row level security;
alter table public.games enable row level security;
alter table public.offers enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- Public read for catalog
drop policy if exists "Games public read" on public.games;
create policy "Games public read" on public.games for select using (true);

drop policy if exists "Offers public read" on public.offers;
create policy "Offers public read" on public.offers for select using (true);

-- Admin full access (role from profiles)
drop policy if exists "Admins manage games" on public.games;
create policy "Admins manage games" on public.games
  for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists "Admins manage offers" on public.offers;
create policy "Admins manage offers" on public.offers
  for all to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Profiles policies (basic)
drop policy if exists "Profiles readable" on public.profiles;
create policy "Profiles readable" on public.profiles for select using (true);

drop policy if exists "Users insert own profile" on public.profiles;
create policy "Users insert own profile" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users update own" on public.profiles;
create policy "Users update own" on public.profiles for update using (auth.uid() = id);

-- Orders: users can see + create their own; admins can see ALL orders
drop policy if exists "Users own orders" on public.orders;
create policy "Users own orders" on public.orders 
  for select 
  using (auth.uid() = user_id);

drop policy if exists "Admins view all orders" on public.orders;
create policy "Admins view all orders" on public.orders 
  for select 
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists "Users create orders" on public.orders;
create policy "Users create orders" on public.orders 
  for insert 
  with check (auth.uid() = user_id);

-- ORDER ITEMS: users see items belonging to their orders; admins see all
drop policy if exists "Users view own order items" on public.order_items;
create policy "Users view own order items" on public.order_items 
  for select 
  using (exists (
    select 1 from public.orders 
    where orders.id = order_items.order_id and orders.user_id = auth.uid()
  ));

drop policy if exists "Admins view all order items" on public.order_items;
create policy "Admins view all order items" on public.order_items 
  for select 
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

drop policy if exists "Users insert own order items" on public.order_items;
create policy "Users insert own order items" on public.order_items 
  for insert 
  with check (exists (
    select 1 from public.orders 
    where orders.id = order_items.order_id and orders.user_id = auth.uid()
  ));

-- =====================================================
-- AUTO PROFILE TRIGGER
-- =====================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'user', new.raw_user_meta_data->>'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- SEED EXAMPLE (optional)
-- =====================================================
-- Add Mobile Legends + sample offers (run this block)
DO $$
DECLARE
  ml_game_id uuid;
BEGIN
  -- Insert game (for the DO block)
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

  -- Insert offers using the captured ID
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
END $$;

-- =====================================================
-- STORAGE BUCKET POLICIES (FIXES "new row violates row-level security policy")
-- Run these AFTER you have created the "product-images" bucket in Supabase Storage
-- and set it to PUBLIC (for read URLs). 
-- These policies allow authenticated ADMIN users to upload/edit images.
-- =====================================================

-- 1. Public read for all images (so product urls work for everyone, including anon)
drop policy if exists "Public read product-images" on storage.objects;
create policy "Public read product-images"
  on storage.objects for select
  using (bucket_id = 'product-images');

-- 2. Admin-only upload (INSERT) - matches table RLS using profiles.role
drop policy if exists "Admins can upload to product-images" on storage.objects;
create policy "Admins can upload to product-images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'product-images' 
    and exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- 3. Admin-only update (for replacing images)
drop policy if exists "Admins can update product-images" on storage.objects;
create policy "Admins can update product-images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'product-images' 
    and exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- 4. Admin-only delete (optional cleanup)
drop policy if exists "Admins can delete from product-images" on storage.objects;
create policy "Admins can delete from product-images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'product-images' 
    and exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- =====================================================
-- AFTER RUNNING THE SCHEMA + STORAGE POLICIES:
-- 1. Storage → Buckets → Ensure "product-images" exists and is PUBLIC
-- 2. Table Editor → profiles → set your user's role = 'admin'
-- 3. Re-login in the app (important after role change)
-- 4. Now uploads for game logos/covers + sale photos (is_sale) will work
--
-- For a quick targeted fix (without full re-seed), run: fix_sale_upload_rls.sql
-- =====================================================
