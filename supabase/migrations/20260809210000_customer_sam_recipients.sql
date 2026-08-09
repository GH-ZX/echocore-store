-- Optional customer recipient identifiers for admin Sam payouts.
alter table public.profiles
  add column if not exists sam_shamcash_wallet_id text,
  add column if not exists sam_syriatel_recipient text;

comment on column public.profiles.sam_shamcash_wallet_id is 'Optional admin/customer Sam ShamCash recipient wallet id';
comment on column public.profiles.sam_syriatel_recipient is 'Optional admin/customer Sam Syriatel phone or cash code';

drop function if exists public.list_admin_recharge_history_rows(text, text, text);
create or replace function public.list_admin_recharge_history_rows(
  p_search text default '',
  p_status text default '',
  p_method text default ''
)
returns table(id uuid, event_at timestamptz, row_data jsonb)
language sql
security definer
set search_path = public
stable as $$
  with source_rows as (
    select
      si.id,
      coalesce(r.user_id, si.user_id) as user_id,
      r.id as recharge_request_id,
      si.sam_invoice_id,
      si.payment_url,
      coalesce(r.amount, si.requested_usd_amount, si.amount) as requested_amount,
      si.paid_amount,
      coalesce(si.currency, r.pay_currency, 'USD') as currency,
      si.method,
      r.payment_method,
      r.status as request_status,
      si.status as payment_status,
       case when credit.id is not null or r.credited_amount is not null then 'credited' else 'not_credited' end as credit_status,
      si.transaction_ref,
      coalesce(r.created_at, si.created_at) as created_at,
      greatest(coalesce(r.updated_at, r.created_at), coalesce(si.updated_at, si.created_at)) as event_at,
       coalesce(credit.amount, r.credited_amount) as credited_amount,
      r.reference,
      r.reviewed_at,
      si.paid_at,
      si.webhook_received_at,
      si.expires_at,
      p.name as customer_name,
      p.username as customer_username
    from public.sam_invoices si
    left join public.recharge_requests r on r.id = si.entity_id
    left join public.profiles p on p.id = coalesce(r.user_id, si.user_id)
    left join lateral (
      select t.id, t.amount
      from public.transactions t
      where t.user_id = coalesce(r.user_id, si.user_id)
         and t.type in ('recharge', 'adjustment')
         and t.amount > 0
         and t.status = 'completed'
         and (
           t.reference = r.reference
           or t.reference = si.transaction_ref
           or t.reference = si.sam_invoice_id
           or t.metadata->>'recharge_request_id' = r.id::text
            or t.metadata->>'requestId' = r.id::text
            or t.metadata->>'rechargeRequestId' = r.id::text
            or t.metadata->>'sam_invoice_id' = si.sam_invoice_id
            or (
              r.status = 'approved'
              and r.reviewed_at is not null
              and t.type = 'adjustment'
              and t.payment_method = 'admin_manual'
              and t.amount = r.amount
              and t.created_at >= r.created_at
              and t.created_at <= r.reviewed_at
               and not (coalesce(t.metadata, '{}'::jsonb) ?| array[
                 'recharge_request_id', 'requestId', 'rechargeRequestId'
               ])
               and not exists (
                 select 1
                 from public.recharge_requests competing
                 where competing.user_id = r.user_id
                   and competing.id <> r.id
                   and competing.status = 'approved'
                   and competing.reviewed_at is not null
                   and competing.amount = r.amount
                   and t.created_at >= competing.created_at
                   and t.created_at <= competing.reviewed_at
                   and (
                     competing.created_at > r.created_at
                     or (competing.created_at = r.created_at and competing.id > r.id)
                   )
               )
             )
          )
      order by t.created_at desc, t.id desc
      limit 1
    ) credit on true
    where si.entity_type = 'recharge'
    union all
    select
      r.id, r.user_id, r.id, null, null, r.amount, null, r.pay_currency, null,
      r.payment_method, r.status, null,
       case when credit.id is not null or r.credited_amount is not null then 'credited' else 'not_credited' end,
       null, r.created_at, r.updated_at, coalesce(credit.amount, r.credited_amount), r.reference, r.reviewed_at,
      null, null, null, p.name, p.username
    from public.recharge_requests r
    left join public.profiles p on p.id = r.user_id
    left join lateral (
      select t.id, t.amount
      from public.transactions t
      where t.user_id = r.user_id
        and t.type in ('recharge', 'adjustment')
        and t.amount > 0
        and t.status = 'completed'
        and (
          t.reference = r.reference
            or t.metadata->>'recharge_request_id' = r.id::text
            or t.metadata->>'requestId' = r.id::text
            or t.metadata->>'rechargeRequestId' = r.id::text
            or (
              r.status = 'approved'
              and r.reviewed_at is not null
              and t.type = 'adjustment'
              and t.payment_method = 'admin_manual'
              and t.amount = r.amount
              and t.created_at >= r.created_at
              and t.created_at <= r.reviewed_at
              and not (coalesce(t.metadata, '{}'::jsonb) ?| array[
                'recharge_request_id', 'requestId', 'rechargeRequestId'
              ])
              and not exists (
                select 1
                from public.recharge_requests competing
                where competing.user_id = r.user_id
                  and competing.id <> r.id
                  and competing.status = 'approved'
                  and competing.reviewed_at is not null
                  and competing.amount = r.amount
                  and t.created_at >= competing.created_at
                  and t.created_at <= competing.reviewed_at
                  and (
                    competing.created_at > r.created_at
                    or (competing.created_at = r.created_at and competing.id > r.id)
                  )
              )
            )
          )
      order by t.created_at desc, t.id desc
      limit 1
    ) credit on true
    where not exists (
      select 1 from public.sam_invoices si
      where si.entity_type = 'recharge' and si.entity_id = r.id
    )
  ), filtered as (
    select s.*
    from source_rows s
    where (nullif(trim(p_status), '') is null or s.request_status = lower(trim(p_status))
      or s.payment_status = lower(trim(p_status)) or s.credit_status = lower(trim(p_status)))
      and (nullif(trim(p_method), '') is null or s.method = lower(trim(p_method))
        or lower(s.payment_method) = lower(trim(p_method)))
      and (nullif(trim(p_search), '') is null or lower(concat_ws(' ', s.customer_name, s.customer_username,
        s.user_id, s.recharge_request_id, s.reference, s.sam_invoice_id, s.transaction_ref)) like '%' || lower(trim(p_search)) || '%')
  )
  select f.id, f.event_at,
    jsonb_build_object(
      'id', f.id, 'user_id', f.user_id, 'customer_id', f.user_id,
      'customer_name', f.customer_name, 'customer_username', f.customer_username,
      'recharge_request_id', f.recharge_request_id, 'reference', f.reference,
      'sam_invoice_id', f.sam_invoice_id, 'payment_url', f.payment_url,
      'requested_amount', f.requested_amount, 'paid_amount', f.paid_amount,
      'credited_amount', f.credited_amount, 'currency', f.currency,
      'method', coalesce(f.method, 'manual'), 'payment_method', f.payment_method,
      'request_status', f.request_status, 'payment_status', f.payment_status,
      'credit_status', f.credit_status, 'transaction_ref', f.transaction_ref,
      'created_at', f.created_at, 'updated_at', f.event_at, 'reviewed_at', f.reviewed_at,
      'paid_at', f.paid_at, 'webhook_received_at', f.webhook_received_at, 'expires_at', f.expires_at
    )
  from filtered f;
$$;

drop function if exists public.list_admin_recharge_history(int, int, text, text, text);
create or replace function public.list_admin_recharge_history(
  p_page int default 1,
  p_page_size int default 25,
  p_search text default '',
  p_status text default '',
  p_method text default '',
  p_admin_id uuid default null
)
returns json
language plpgsql
security definer
set search_path = public
stable as $$
declare
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_page_size int := least(greatest(coalesce(p_page_size, 25), 1), 100);
  v_search text := lower(trim(coalesce(p_search, '')));
  v_status text := lower(trim(coalesce(p_status, '')));
  v_method text := lower(trim(coalesce(p_method, '')));
  v_total int;
  v_rows json;
  v_by_request_status json;
  v_by_credit_status json;
begin
  -- Called by the edge function with the service role, where auth.uid() is
  -- null. The edge has already verified the caller is an admin; validate the
  -- passed admin id against profiles instead of auth.uid().
  if p_admin_id is null
     or not exists (select 1 from public.profiles where id = p_admin_id and role = 'admin') then
    raise exception 'Unauthorized';
  end if;

  with audit_rows as (
    select row_data->>'request_status' as request_status
    from public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  select count(*) into v_total from audit_rows;

  with audit_rows as (
    select row_data->>'request_status' as request_status
    from public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  select coalesce(json_object_agg(request_status, status_count), '{}'::json)
    into v_by_request_status
  from (select coalesce(request_status, 'unlinked') request_status, count(*) status_count
         from audit_rows group by request_status) counts;

  with audit_rows as (
    select row_data->>'credit_status' as credit_status
    from public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  select coalesce(json_object_agg(credit_status, status_count), '{}'::json)
    into v_by_credit_status
  from (select coalesce(credit_status, 'unknown') credit_status, count(*) status_count
        from audit_rows group by credit_status) counts;

  with audit_rows as (
    select * from public.list_admin_recharge_history_rows(v_search, v_status, v_method)
  )
  select coalesce(json_agg(page_rows.row_data order by page_rows.event_at desc, page_rows.id desc), '[]'::json)
    into v_rows
  from (
    select * from audit_rows
    order by event_at desc, id desc
    offset (v_page - 1) * v_page_size limit v_page_size
  ) page_rows;

  return json_build_object(
    'rows', v_rows,
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size,
    'stats', json_build_object(
      'total', v_total,
      'byRequestStatus', v_by_request_status,
      'byCreditStatus', v_by_credit_status
    )
  );
end;
$$;

drop function if exists public.list_admin_recharge_history(int, int, text, text, text, uuid);
revoke execute on function public.list_admin_recharge_history(int, int, text, text, text, uuid) from public;
grant execute on function public.list_admin_recharge_history(int, int, text, text, text, uuid) to authenticated;
revoke execute on function public.list_admin_recharge_history_rows(text, text, text) from public;

drop function if exists public.admin_list_users(text, int);
drop function if exists public.admin_list_users(text, int, int, text, text, text);
create or replace function public.admin_list_users(
  p_search text default '',
  p_limit int default 50,
  p_offset int default 0,
  p_order_by text default 'created_at',
  p_balance_filter text default 'all',
  p_status_filter text default 'all'
)
returns json
language plpgsql
security definer
set search_path = public
stable as $$
declare
  v_search text := lower(trim(coalesce(p_search, '')));
  v_order_by text := lower(trim(coalesce(p_order_by, 'created_at')));
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if v_order_by not in ('created_at', 'balance', 'total_spent', 'order_count', 'name', 'username') then
    v_order_by := 'created_at';
  end if;

  return (
    with filtered as (
      select
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
        p.sam_shamcash_wallet_id,
        p.sam_syriatel_recipient,
        p.created_at,
        u.email,
        coalesce((select sum(o.total) from public.orders o where o.user_id = p.id and o.status = 'completed'), 0) as total_spent,
        (select count(*)::int from public.orders o where o.user_id = p.id and o.status = 'completed') as order_count
      from public.profiles p
      join auth.users u on u.id = p.id
      where p.role = 'user'
        and (
          v_search = ''
          or lower(coalesce(p.username, '')) like '%' || v_search || '%'
          or lower(coalesce(p.name, '')) like '%' || v_search || '%'
          or lower(coalesce(u.email, '')) like '%' || v_search || '%'
        )
        and (
          lower(coalesce(p_balance_filter, 'all')) = 'all'
          or (lower(p_balance_filter) = 'positive' and p.balance > 0)
          or (lower(p_balance_filter) = 'zero' and p.balance = 0)
        )
        and (
          lower(coalesce(p_status_filter, 'all')) = 'all'
          or (lower(p_status_filter) = 'verified' and p.verified_at is not null)
          or (lower(p_status_filter) = 'unverified' and p.verified_at is null)
          or (lower(p_status_filter) = 'banned' and p.banned_at is not null and (p.ban_expires_at is null or p.ban_expires_at > now()))
          or (lower(p_status_filter) = 'active' and (p.banned_at is null or (p.ban_expires_at is not null and p.ban_expires_at <= now())))
        )
    )
    select json_build_object(
      'rows', coalesce((
        select json_agg(row_to_json(page))
        from (
          select *
          from filtered
          order by
            case when v_order_by = 'balance' then balance end desc nulls last,
            case when v_order_by = 'total_spent' then total_spent end desc nulls last,
            case when v_order_by = 'order_count' then order_count end desc nulls last,
            case when v_order_by = 'name' then lower(coalesce(name, '')) end asc,
            case when v_order_by = 'username' then lower(coalesce(username, '')) end asc,
            created_at desc,
            id desc
          limit greatest(1, least(coalesce(p_limit, 50), 100))
          offset greatest(0, coalesce(p_offset, 0))
        ) page
      ), '[]'::json),
      'total', (select count(*) from filtered)
    )
  );
end;
$$;

revoke execute on function public.admin_list_users(text, int, int, text, text, text) from public;
grant execute on function public.admin_list_users(text, int, int, text, text, text) to authenticated;

drop function if exists public.admin_update_user_profile(uuid, text, text, text, text, text, text, text);
drop function if exists public.admin_update_user_profile(uuid, text, text, text, text, text, text, text, text, text);
create or replace function public.admin_update_user_profile(
  p_user_id uuid,
  p_name text default null,
  p_phone text default null,
  p_country text default null,
  p_bio text default null,
  p_discord_username text default null,
  p_favorite_game text default null,
  p_default_player_uid text default null,
  p_sam_shamcash_wallet_id text default null,
  p_sam_syriatel_recipient text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
  v_shamcash text := nullif(trim(p_sam_shamcash_wallet_id), '');
  v_syriatel text := nullif(trim(p_sam_syriatel_recipient), '');
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  if p_user_id is null then
    raise exception 'User is required';
  end if;

  if v_shamcash is not null and v_shamcash !~* '^[0-9a-f]{32}$' then
    raise exception 'Invalid ShamCash recipient';
  end if;
  if v_syriatel is not null and v_syriatel !~ '^(09[0-9]{8}|[0-9]{8})$' then
    raise exception 'Invalid Syriatel recipient';
  end if;

  update public.profiles
  set
    name = case when p_name is null then name else nullif(trim(p_name), '') end,
    phone = case when p_phone is null then phone else nullif(trim(p_phone), '') end,
    country = case when p_country is null then country else nullif(trim(p_country), '') end,
    bio = case when p_bio is null then bio else nullif(trim(p_bio), '') end,
    discord_username = case when p_discord_username is null then discord_username else nullif(trim(p_discord_username), '') end,
    favorite_game = case when p_favorite_game is null then favorite_game else nullif(trim(p_favorite_game), '') end,
    default_player_uid = case when p_default_player_uid is null then default_player_uid else nullif(trim(p_default_player_uid), '') end,
    sam_shamcash_wallet_id = case when p_sam_shamcash_wallet_id is null then sam_shamcash_wallet_id else v_shamcash end,
    sam_syriatel_recipient = case when p_sam_syriatel_recipient is null then sam_syriatel_recipient else v_syriatel end
  where id = p_user_id
  returning * into v_row;

  if v_row.id is null then
    raise exception 'User not found';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'phone', v_row.phone,
    'country', v_row.country,
    'bio', v_row.bio,
    'discord_username', v_row.discord_username,
    'favorite_game', v_row.favorite_game,
    'default_player_uid', v_row.default_player_uid,
    'sam_shamcash_wallet_id', v_row.sam_shamcash_wallet_id,
    'sam_syriatel_recipient', v_row.sam_syriatel_recipient,
    'username', v_row.username,
    'balance', v_row.balance
  );
end;
$$;

revoke execute on function public.admin_update_user_profile(uuid, text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_user_profile(uuid, text, text, text, text, text, text, text, text, text) to authenticated;

drop function if exists public.admin_get_user_profile(uuid);
create or replace function public.admin_get_user_profile(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_row public.profiles%rowtype;
  v_email text;
  v_order_count int;
  v_recharge_count int;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select * into v_row from public.profiles where id = p_user_id;
  if not found then
    raise exception 'User not found';
  end if;

  select email into v_email from auth.users where id = p_user_id;
  select count(*)::int into v_order_count from public.orders where user_id = p_user_id;
  select count(*)::int into v_recharge_count from public.recharge_requests where user_id = p_user_id;

  return jsonb_build_object(
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
    'sam_shamcash_wallet_id', v_row.sam_shamcash_wallet_id,
    'sam_syriatel_recipient', v_row.sam_syriatel_recipient,
    'favorite_game', v_row.favorite_game,
    'discord_username', v_row.discord_username,
    'default_player_uid', v_row.default_player_uid,
    'game_player_uids', coalesce(v_row.game_player_uids, '{}'::jsonb),
    'banned_at', v_row.banned_at,
    'ban_expires_at', v_row.ban_expires_at,
    'ban_reason', v_row.ban_reason,
    'verified_at', v_row.verified_at,
    'created_at', v_row.created_at,
    'orderCount', v_order_count,
    'rechargeCount', v_recharge_count
  );
end;
$$;

revoke execute on function public.admin_get_user_profile(uuid) from public;
grant execute on function public.admin_get_user_profile(uuid) to authenticated;

drop function if exists public.admin_get_user_by_username(text);
create or replace function public.admin_get_user_by_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  v_user_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  select id into v_user_id
  from public.profiles
  where lower(username) = lower(trim(regexp_replace(coalesce(p_username, ''), '^@+', '')))
  limit 1;

  if v_user_id is null then
    return null;
  end if;

  return public.admin_get_user_profile(v_user_id);
end;
$$;

revoke execute on function public.admin_get_user_by_username(text) from public;
grant execute on function public.admin_get_user_by_username(text) to authenticated;

drop function if exists public.admin_get_profile_summaries(uuid[]);
create or replace function public.admin_get_profile_summaries(p_user_ids uuid[])
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public.is_admin() then
    raise exception 'Unauthorized';
  end if;

  return coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'username', p.username,
        'name', p.name,
        'role', p.role,
        'balance', p.balance,
        'sam_shamcash_wallet_id', p.sam_shamcash_wallet_id,
        'sam_syriatel_recipient', p.sam_syriatel_recipient
      ) order by p.created_at desc)
      from public.profiles p
      where p.id = any(coalesce(p_user_ids, '{}'::uuid[]))
    ),
    '[]'::jsonb
  );
end;
$$;

revoke execute on function public.admin_get_profile_summaries(uuid[]) from public;
grant execute on function public.admin_get_profile_summaries(uuid[]) to authenticated;
