-- Fix list_admin_recharge_history admin check: the edge function calls it with
-- the service role (auth.uid() is null), so validate the passed admin id instead.
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

revoke execute on function public.list_admin_recharge_history(int, int, text, text, text, uuid) from public;
grant execute on function public.list_admin_recharge_history(int, int, text, text, text, uuid) to authenticated;
