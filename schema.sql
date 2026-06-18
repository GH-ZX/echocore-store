-- =====================================================
-- ECHOCORE STORE - SUPABASE SCHEMA
-- Project: https://uaiirtgzqtnrvcrlxstg.supabase.co
-- Run this entire file in Supabase SQL Editor (one go)
-- =====================================================

-- 1. PROFILES TABLE (for roles)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  name text,
  created_at timestamptz default now()
);

-- 2. PRODUCTS TABLE (main catalog)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  price numeric(10,2) not null default 9.99,
  category text not null check (category in ('games', 'cards')),
  color text default 'from-cyan-500 to-blue-600',
  image_url text,
  logo_url text,
  created_at timestamptz default now()
);

-- 3. ORDERS
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  total numeric(10,2) not null,
  payment_method text,
  status text default 'completed',
  created_at timestamptz default now()
);

-- 4. ORDER ITEMS
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  name_snapshot text not null,
  price numeric(10,2) not null,
  quantity integer default 1
);

-- =====================================================
-- ENABLE ROW LEVEL SECURITY
-- =====================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- =====================================================
-- RLS POLICIES
-- =====================================================

-- PRODUCTS: Public read
drop policy if exists "Products public read" on public.products;
create policy "Products public read"
  on public.products for select
  to anon, authenticated
  using (true);

-- Only admins can modify products
drop policy if exists "Admins manage products" on public.products;
create policy "Admins manage products"
  on public.products
  for all
  to authenticated
  using (
    exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles 
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- PROFILES policies
drop policy if exists "Profiles are readable by everyone" on public.profiles;
create policy "Profiles are readable by everyone"
  on public.profiles for select using (true);

drop policy if exists "Users can insert own profile" on public.profiles;
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "Users can update own profile" on public.profiles;
create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ORDERS policies
drop policy if exists "Users view own orders" on public.orders;
create policy "Users view own orders"
  on public.orders for select using (auth.uid() = user_id);

drop policy if exists "Users create own orders" on public.orders;
create policy "Users create own orders"
  on public.orders for insert with check (auth.uid() = user_id);

-- ORDER ITEMS policies
drop policy if exists "Users view own order items" on public.order_items;
create policy "Users view own order items"
  on public.order_items for select 
  using (exists (
    select 1 from public.orders 
    where orders.id = order_items.order_id and orders.user_id = auth.uid()
  ));

drop policy if exists "Users insert own order items" on public.order_items;
create policy "Users insert own order items"
  on public.order_items for insert 
  with check (exists (
    select 1 from public.orders 
    where orders.id = order_items.order_id and orders.user_id = auth.uid()
  ));

-- =====================================================
-- AUTO-CREATE PROFILE TRIGGER (recommended)
-- =====================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'user', new.raw_user_meta_data->>'name');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =====================================================
-- SEED INITIAL PRODUCTS (ECHOCORE catalog)
-- =====================================================

-- Note: image_url uses your Supabase Storage public URLs
-- Update these if you change bucket name or upload more files

insert into public.products (name_en, name_ar, description_en, description_ar, price, category, color, image_url, logo_url)
values 
('Valorant', 'Valorant', 
 'Top up Valorant Points instantly. Secure delivery for competitive play.', 
 'شحن نقاط فالورانت فوراً. تسليم آمن للعب التنافسي.',
 9.99, 'games', 'from-red-500 to-rose-600', 
 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/valorant.png',
 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/valorant-logo.png'),

('League of Legends', 'League of Legends', 
 'Purchase RP for League of Legends. Instant digital delivery.', 
 'اشترِ RP لـ League of Legends. تسليم رقمي فوري.',
 10.99, 'games', 'from-cyan-500 to-blue-600', 
 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/lol.png',
 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/lol-logo.png'),

('Steam Wallet $20', 'محفظة ستيم 20$', 
 'Add $20 instantly to your Steam Wallet. Works globally.', 
 'أضف 20 دولار فوراً إلى محفظة ستيم. يعمل عالمياً.',
 19.99, 'cards', 'from-slate-700 to-slate-900', null, null),

('Steam Wallet $50', 'محفظة ستيم 50$', 
 'Steam Wallet Code $50 — instant top-up.', 
 'كود محفظة ستيم 50 دولار — شحن فوري.',
 49.99, 'cards', 'from-slate-800 to-black', null, null),

('Xbox PC Game Pass 1 Month', 'Xbox PC Game Pass شهر', 
 '1 Month of Xbox PC Game Pass. Access hundreds of games.', 
 'اشتراك Xbox Game Pass للكمبيوتر لمدة شهر واحد.',
 9.99, 'games', 'from-green-500 to-green-700', 
 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/xboxpass.png',
 'https://uaiirtgzqtnrvcrlxstg.supabase.co/storage/v1/object/public/product-images/xbox-logo.png'),

('Discord Nitro 1 Month', 'ديسكورد نايترو شهر', 
 'Unlock Discord Nitro benefits for 30 days.', 
 'استمتع بمميزات ديسكورد نايترو لمدة 30 يوماً.',
 9.99, 'cards', 'from-indigo-500 to-purple-600', null, null),

('Fortnite', 'Fortnite', 
 'V-Bucks top-up for Fortnite. Fast and secure.', 
 'شحن عملة V-Bucks لـ Fortnite. سريع وآمن.',
 14.99, 'games', 'from-purple-500 to-pink-600', null, null),

('Minecraft', 'Minecraft', 
 'Minecraft Marketplace or Realms credit.', 
 'رصيد سوق ماينكرافت أو Realms.',
 12.99, 'games', 'from-amber-500 to-amber-700', null, null),

('Battle.net $20 Gift Card', 'بطاقة هدايا باتل نت 20$', 
 'Battle.net balance for WoW, Overwatch, etc.', 
 'رصيد باتل نت لـ WoW و Overwatch وغيرها.',
 19.99, 'cards', 'from-blue-600 to-blue-800', null, null),

('Epic Games $25', 'رصيد إيبك جيمز 25$', 
 'Epic Games Store credit for Fortnite, Rocket League & more.', 
 'رصيد متجر إيبك لفورتنايت ورocket League وأكثر.',
 24.99, 'cards', 'from-gray-700 to-gray-900', null, null)
on conflict (id) do nothing;

-- =====================================================
-- IMPORTANT NEXT STEPS (after running this SQL):
-- 1. Go to Authentication > Providers and enable Email
-- 2. (Recommended) Create a Storage bucket called "product-images" and make it Public
-- 3. Sign up in the app using any email
-- 4. In Supabase Table Editor → profiles → set your row's "role" to "admin"
-- 5. Start adding/updating products from the Admin panel
-- =====================================================
