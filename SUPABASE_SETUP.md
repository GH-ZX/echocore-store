# ECHOCORE — Supabase Setup Guide (Make it REAL)

This guide turns the project into a production-ready digital store with real database, auth, and persistence.

## 1. Create Supabase Project

1. Go to https://supabase.com and create a new project (free tier is perfect).
2. Wait for it to provision (~1 min).
3. Go to **Project Settings → API**
   - Copy **Project URL** → `VITE_SUPABASE_URL`
   - Copy **anon public** key → `VITE_SUPABASE_ANON_KEY`

4. Create `.env` file in project root:
   ```bash
   cp .env.example .env
   ```
   Paste the two values.

## 2. Run the Database Schema

Go to **SQL Editor** in Supabase dashboard and paste + run this entire block:

```sql
-- =====================================================
-- ECHOCORE STORE — PRODUCTION SCHEMA
-- =====================================================

-- PROFILES (user roles)
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  role text not null default 'user' check (role in ('user','admin')),
  name text,
  created_at timestamptz default now()
);

-- PRODUCTS (universal source of truth)
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  description_en text,
  description_ar text,
  price numeric(10,2) not null default 9.99,
  category text not null check (category in ('games','cards')),
  color text default 'from-cyan-500 to-blue-600',
  image_url text,
  created_at timestamptz default now()
);

-- ORDERS
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  total numeric(10,2) not null,
  payment_method text,
  status text default 'completed',
  created_at timestamptz default now()
);

-- ORDER ITEMS (snapshot)
create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  product_id uuid references public.products(id),
  name_snapshot text not null,
  price numeric(10,2) not null,
  quantity integer default 1
);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
alter table public.profiles enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

-- PRODUCTS: Everyone can read
create policy "Products public read"
  on public.products for select
  to anon, authenticated
  using (true);

-- Only admins can modify products
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

-- PROFILES
create policy "Profiles are readable by everyone"
  on public.profiles for select using (true);

create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- ORDERS (users can only see/create their own)
create policy "Users view own orders"
  on public.orders for select using (auth.uid() = user_id);

create policy "Users create own orders"
  on public.orders for insert with check (auth.uid() = user_id);

create policy "Users view own order items"
  on public.order_items for select 
  using (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
  );

create policy "Users insert own order items"
  on public.order_items for insert 
  with check (
    exists (select 1 from public.orders where orders.id = order_items.order_id and orders.user_id = auth.uid())
  );

-- =====================================================
-- HELPER: Auto-create profile on signup (recommended)
-- =====================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, role, name)
  values (new.id, 'user', new.raw_user_meta_data->>'name');
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

After running:
- Go to **Authentication → Providers** → Enable **Email** (password).
- (Optional) Go to **Storage** → New bucket → Name: `product-images` → Make **Public**.

## 3. Seed Initial Products (Run in SQL Editor)

```sql
-- Seed ECHOCORE products (update image_url after you upload to storage)
insert into public.products (name_en, name_ar, description_en, description_ar, price, category, color, image_url) values
('Valorant', 'Valorant', 'Top up Valorant Points instantly. Secure and fast.', 'شحن نقاط فالورانت فوراً. آمن وسريع.', 9.99, 'games', 'from-red-500 to-rose-600', 'https://your-project.supabase.co/storage/v1/object/public/product-images/valorant.png'),
('League of Legends', 'League of Legends', 'Buy RP for League of Legends. Instant delivery.', 'اشترِ RP لـ League of Legends. تسليم فوري.', 10.99, 'games', 'from-cyan-500 to-blue-600', 'https://your-project.supabase.co/storage/v1/object/public/product-images/lol.png'),
('Steam Wallet $20', 'محفظة ستيم 20$', 'Add funds to your Steam wallet instantly.', 'أضف رصيد إلى محفظة ستيم فوراً.', 19.99, 'cards', 'from-slate-700 to-slate-900', null),
('Steam Wallet $50', 'محفظة ستيم 50$', 'Steam Wallet Code $50 — instant.', 'كود محفظة ستيم 50 دولار — فوري.', 49.99, 'cards', 'from-slate-800 to-black', null),
('Xbox PC Game Pass 1 Month', 'Xbox PC Game Pass شهر', '1 month of Xbox Game Pass for PC.', 'اشتراك Xbox Game Pass للكمبيوتر لشهر واحد.', 9.99, 'games', 'from-green-500 to-green-700', null),
('Discord Nitro 1 Month', 'ديسكورد نايترو شهر', 'Unlock Nitro perks for one month.', 'استمتع بمميزات Nitro لمدة شهر.', 9.99, 'cards', 'from-indigo-500 to-purple-600', null),
('Fortnite', 'Fortnite', 'V-Bucks top-up for Fortnite.', 'شحن عملة فورتنايت.', 14.99, 'games', 'from-purple-500 to-pink-600', null),
('Minecraft', 'Minecraft', 'Minecraft Realms or Marketplace credit.', 'رصيد ماينكرافت.', 12.99, 'games', 'from-amber-500 to-amber-700', null)
on conflict do nothing;
```

**Tip for images:** 
- Upload your existing `src/assets/*.png` to the `product-images` bucket in Supabase Storage.
- Use the public URL for `image_url`.

## 4. Create First Admin

After you sign up normally (any email):

1. In Supabase → **Table Editor** → `profiles`
2. Find your user row and change `role` to `admin`

## 5. Run the App

```bash
npm run dev
```

Login with any email/password (Supabase will create the user).

The admin panel will only appear for users with `role = 'admin'`.

## 6. Next Level (Optional)

- Add image upload in AdminView using `supabase.storage`
- Add real-time product updates with Supabase subscriptions
- Add order history view for users

You now have a **real** database-backed store.
Everything (products, auth, orders) lives in Supabase.
