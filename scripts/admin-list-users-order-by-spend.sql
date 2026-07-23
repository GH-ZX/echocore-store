-- Admin users: richer order-by (wallet, spend, orders, newest) + spend/order counts on rows
-- Apply: npx supabase db query --linked -f scripts/admin-list-users-order-by-spend.sql

CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_order_by text DEFAULT 'created_at',
  p_balance_filter text DEFAULT 'all',
  p_status_filter text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_search text := lower(trim(COALESCE(p_search, '')));
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 50), 100));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_order text := lower(trim(COALESCE(p_order_by, 'created_at')));
  v_bal text := lower(trim(COALESCE(p_balance_filter, 'all')));
  v_status text := lower(trim(COALESCE(p_status_filter, 'all')));
  v_total bigint := 0;
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Aliases: top_wallet=balance, best_customer=total_spent, most_orders=order_count
  IF v_order IN ('top_wallet', 'wallet') THEN
    v_order := 'balance';
  ELSIF v_order IN ('best_customer', 'spend', 'total_spent') THEN
    v_order := 'total_spent';
  ELSIF v_order IN ('most_orders', 'orders') THEN
    v_order := 'order_count';
  ELSIF v_order IN ('newest', 'recent') THEN
    v_order := 'created_at';
  ELSIF v_order NOT IN ('created_at', 'balance', 'name', 'username', 'total_spent', 'order_count') THEN
    v_order := 'created_at';
  END IF;

  IF v_bal NOT IN ('all', 'positive', 'zero') THEN
    v_bal := 'all';
  END IF;

  IF v_status NOT IN ('all', 'verified', 'unverified', 'banned', 'active') THEN
    v_status := 'all';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.profiles p
  JOIN auth.users u ON u.id = p.id
  WHERE p.role = 'user'
    AND (
      v_search = ''
      OR lower(COALESCE(p.username, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(p.name, '')) LIKE '%' || v_search || '%'
      OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
    )
    AND (
      v_bal = 'all'
      OR (v_bal = 'positive' AND COALESCE(p.balance, 0) > 0)
      OR (v_bal = 'zero' AND COALESCE(p.balance, 0) = 0)
    )
    AND (
      v_status = 'all'
      OR (v_status = 'verified' AND p.verified_at IS NOT NULL)
      OR (v_status = 'unverified' AND p.verified_at IS NULL)
      OR (
        v_status = 'banned'
        AND p.banned_at IS NOT NULL
        AND (p.ban_expires_at IS NULL OR p.ban_expires_at > now())
      )
      OR (
        v_status = 'active'
        AND (
          p.banned_at IS NULL
          OR (p.ban_expires_at IS NOT NULL AND p.ban_expires_at <= now())
        )
      )
    );

  SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) INTO v_rows
  FROM (
    SELECT
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
      p.created_at,
      u.email,
      COALESCE(stats.order_count, 0)::int AS order_count,
      COALESCE(stats.total_spent, 0)::numeric AS total_spent
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    LEFT JOIN LATERAL (
      -- Successful sales only (exclude pending / cancelled / failed)
      SELECT
        count(*)::int AS order_count,
        COALESCE(sum(o.total), 0)::numeric AS total_spent
      FROM public.orders o
      WHERE o.user_id = p.id
        AND o.status = 'completed'
    ) stats ON true
    WHERE p.role = 'user'
      AND (
        v_search = ''
        OR lower(COALESCE(p.username, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(p.name, '')) LIKE '%' || v_search || '%'
        OR lower(COALESCE(u.email, '')) LIKE '%' || v_search || '%'
      )
      AND (
        v_bal = 'all'
        OR (v_bal = 'positive' AND COALESCE(p.balance, 0) > 0)
        OR (v_bal = 'zero' AND COALESCE(p.balance, 0) = 0)
      )
      AND (
        v_status = 'all'
        OR (v_status = 'verified' AND p.verified_at IS NOT NULL)
        OR (v_status = 'unverified' AND p.verified_at IS NULL)
        OR (
          v_status = 'banned'
          AND p.banned_at IS NOT NULL
          AND (p.ban_expires_at IS NULL OR p.ban_expires_at > now())
        )
        OR (
          v_status = 'active'
          AND (
            p.banned_at IS NULL
            OR (p.ban_expires_at IS NOT NULL AND p.ban_expires_at <= now())
          )
        )
      )
    ORDER BY
      CASE WHEN v_order = 'balance' THEN p.balance END DESC NULLS LAST,
      CASE WHEN v_order = 'total_spent' THEN COALESCE(stats.total_spent, 0) END DESC NULLS LAST,
      CASE WHEN v_order = 'order_count' THEN COALESCE(stats.order_count, 0) END DESC NULLS LAST,
      CASE WHEN v_order = 'name' THEN lower(COALESCE(p.name, p.username, '')) END ASC NULLS LAST,
      CASE WHEN v_order = 'username' THEN lower(COALESCE(p.username, '')) END ASC NULLS LAST,
      CASE WHEN v_order = 'created_at' THEN p.created_at END DESC NULLS LAST,
      p.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN json_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text, text) TO authenticated;
