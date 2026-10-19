-- Names for Sam payout recipients (ShamCash id / Syriatel number), shared by all admins.
-- source: 'manual' = typed by an admin, 'auto' = real account name read from the wallet history.
create table if not exists public.sam_recipient_names (
  method text not null check (method in ('shamcash', 'syriatel')),
  recipient_identifier text not null,
  label text not null check (char_length(btrim(label)) between 1 and 80),
  source text not null default 'manual' check (source in ('manual', 'auto')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (method, recipient_identifier)
);

alter table public.sam_recipient_names enable row level security;

drop policy if exists sam_recipient_names_admin_all on public.sam_recipient_names;
create policy sam_recipient_names_admin_all on public.sam_recipient_names
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

revoke all on public.sam_recipient_names from anon;
grant select, insert, update, delete on public.sam_recipient_names to authenticated;
