-- Admin payout ledger (money sent out of a linked wallet via Sam API)
create table if not exists public.sam_transfers (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references auth.users(id) on delete set null,
  customer_id uuid references public.profiles(id) on delete set null,
  method text not null check (method in ('shamcash', 'syriatel')),
  source_identifier text,
  recipient_identifier text not null,
  currency text not null check (currency in ('USD', 'SYP', 'EUR')),
  amount numeric(14,2) not null check (amount > 0),
  note text,
  status text not null default 'completed' check (status in ('completed', 'failed')),
  sam_message text,
  created_at timestamptz not null default now()
);

alter table public.sam_transfers
  add column if not exists customer_id uuid references public.profiles(id) on delete set null;

create index if not exists sam_transfers_customer_idx
  on public.sam_transfers (customer_id, created_at desc);

create index if not exists sam_transfers_created_idx
  on public.sam_transfers (created_at desc);

alter table public.sam_transfers enable row level security;

drop policy if exists "Admins read sam transfers" on public.sam_transfers;
create policy "Admins read sam transfers" on public.sam_transfers
  for select to authenticated
  using (public.is_admin());

drop policy if exists "Admins manage sam transfers" on public.sam_transfers;
create policy "Admins manage sam transfers" on public.sam_transfers
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
