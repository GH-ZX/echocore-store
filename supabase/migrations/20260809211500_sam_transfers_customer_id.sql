-- Ensure sam_transfers.customer_id exists (prior migration was applied before this column was added).
alter table public.sam_transfers
  add column if not exists customer_id uuid references public.profiles(id) on delete set null;

create index if not exists sam_transfers_customer_idx
  on public.sam_transfers (customer_id, created_at desc);
