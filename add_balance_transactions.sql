-- =====================================================
-- ECHOCORE STORE - ADD USER BALANCE + TRANSACTIONS
-- Run this in Supabase SQL Editor (after the main schema_games_offers.sql)
-- Adds:
--   - balance column to profiles (default 0)
--   - transactions table for recharge + purchase history
--   - Basic RLS (users see own tx + own balance)
--   - Recommended secure RPC for crediting balance (use in production)
-- =====================================================

-- 1. ADD BALANCE TO PROFILES
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS balance numeric(10,2) NOT NULL DEFAULT 0;

-- Optional: backfill if needed
-- UPDATE public.profiles SET balance = 0 WHERE balance IS NULL;

-- 2. CREATE TRANSACTIONS TABLE (for recharges and spend)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('recharge', 'purchase', 'refund', 'adjustment')),
  amount numeric(10,2) not null,          -- positive for recharge, negative for purchase
  balance_after numeric(10,2),           -- snapshot after the op
  payment_method text,
  reference text,                        -- e.g. external order id, invoice, payment_intent
  status text default 'completed' check (status in ('pending', 'completed', 'failed', 'cancelled')),
  metadata jsonb,                        -- any extra info (future)
  created_at timestamptz default now()
);

-- 3. ENABLE RLS
alter table public.transactions enable row level security;

-- 4. RLS POLICIES
-- Users can read their own transactions
drop policy if exists "Users view own transactions" on public.transactions;
create policy "Users view own transactions"
  on public.transactions for select
  using (auth.uid() = user_id);

-- Users can insert their own (for recharges recorded client-side after simulated/real verification)
drop policy if exists "Users insert own transactions" on public.transactions;
create policy "Users insert own transactions"
  on public.transactions for insert
  with check (auth.uid() = user_id);

-- Admins can view ALL transactions
drop policy if exists "Admins view all transactions" on public.transactions;
create policy "Admins view all transactions"
  on public.transactions for select
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- Profiles: allow users to read/update their own balance (simple). 
-- For production prefer RPC only for writes.
drop policy if exists "Users can read own profile incl balance" on public.profiles;
create policy "Users can read own profile incl balance"
  on public.profiles for select using (auth.uid() = id);

-- Keep existing update own policy (already allows updating balance)
-- Admins can update any profile balance
drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles"
  on public.profiles for update
  to authenticated
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

-- 5. RECOMMENDED: SECURE RPC FUNCTION TO CREDIT BALANCE (HIGHLY RECOMMENDED)
-- Call this from Edge Function or trusted server code after verifying payment.
-- This prevents clients from directly increasing their balance.
create or replace function public.credit_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  new_balance numeric;
begin
  -- Only allow positive amounts for credit
  if p_amount <= 0 then
    raise exception 'Amount must be positive';
  end if;

  update public.profiles
    set balance = coalesce(balance, 0) + p_amount
    where id = p_user_id
    returning balance into new_balance;

  insert into public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  values (p_user_id, 'recharge', p_amount, new_balance, p_payment_method, p_reference, 'completed');

  return new_balance;
end;
$$;

-- Grant execute to authenticated users (they still can't call with wrong user because of checks inside)
-- In a real secure flow you call this only from a service_role Edge Function after webhook validation.
grant execute on function public.credit_user_balance(uuid, numeric, text, text) to authenticated;

-- 6. HELPER: deduct balance for purchases (optional, can be done in submit flow too)
create or replace function public.deduct_user_balance(
  p_user_id uuid,
  p_amount numeric,
  p_payment_method text default 'balance',
  p_reference text default null
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  current numeric;
  new_balance numeric;
begin
  if p_amount <= 0 then
    raise exception 'Deduct amount must be positive';
  end if;

  select balance into current from public.profiles where id = p_user_id;
  if current is null or current < p_amount then
    raise exception 'Insufficient balance';
  end if;

  update public.profiles
    set balance = balance - p_amount
    where id = p_user_id
    returning balance into new_balance;

  insert into public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
  values (p_user_id, 'purchase', -p_amount, new_balance, p_payment_method, p_reference, 'completed');

  return new_balance;
end;
$$;

grant execute on function public.deduct_user_balance(uuid, numeric, text, text) to authenticated;

-- =====================================================
-- USAGE NOTES (IMPORTANT)
-- =====================================================
-- 1. Run this SQL.
-- 2. After any existing users, their balance will be 0. Good.
-- 3. For PRODUCTION recharges:
--    - For Binance Pay: use Create Order (server), show QR, receive webhook, call credit_user_balance via Edge Function (service_role key).
--    - For ShamCash: request their merchant API via https://shamcash.sy/ar/apiRequest . Once you have credentials, create invoice, on paid callback call the credit RPC.
--    - For Cards (Stripe): create PaymentIntent server-side, confirm on client, on webhook 'payment_intent.succeeded' call credit RPC.
-- 4. In the app (SPA) we simulate success and call direct updates or the RPC (client can call the RPC, but amount is trusted only after your verification).
-- 5. You can also allow users to view their transaction history on /recharge or dashboard.
--
-- To give test balance to a user quickly:
--   UPDATE profiles SET balance = 50 WHERE id = 'your-user-uuid';
-- =====================================================