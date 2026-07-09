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

## 2. Run the Database Schema & Seed Data

Instead of running multiple separate SQL files, we have consolidated the entire database schema, security policies, triggers, custom RPC functions, storage configuration, and seed data into a single file:

👉 Run all SQL commands located in [supabase_complete_schema.sql](file:///c:/Users/Administrator/Coding/echocore-store/supabase_complete_schema.sql) in your Supabase **SQL Editor**.

This unified script will:
1. Create all 8 required tables (`profiles`, `games`, `offers`, `orders`, `order_items`, `transactions`, `store_settings`, `customer_reviews`).
2. Apply appropriate **Row Level Security (RLS)** and access policies.
3. Establish security triggers (e.g., auto-creating profiles on signup).
4. Register crucial transactional RPC functions (like atomic order processing `create_order_atomic` and balance deduction).
5. Provision the `"product-images"` storage bucket automatically and set up admin upload policies.
6. Seed default settings, starter customer reviews, and a sample game (Mobile Legends) with packages.

### Security migration (required for existing projects)

If you already ran an older version of the schema, also run:

👉 [supabase_security_migration.sql](./supabase_security_migration.sql) in the Supabase **SQL Editor**.

This migration:
- Restricts profile reads to the signed-in user (and admins)
- Blocks client-side balance/role changes on profiles
- Adds caller verification to balance/order RPCs
- Creates external orders as `pending_payment` until confirmed
- Removes unsafe direct INSERT policies on orders/transactions

Checkout and recharge **will not work** until this migration (or the updated full schema) is applied.

### Storage & Image Assets Setup (Recommended)
1. In your Supabase dashboard, navigate to **Storage > Buckets**.
2. Verify that the `"product-images"` bucket was created and ensure it is set to **Public** so product images can load for site visitors.
3. You can upload game banner/logo images here and use their public URLs as `image_url` or `logo_url` in your games catalog.


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
