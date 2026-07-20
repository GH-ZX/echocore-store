-- Admin user list: balance + status filters with pagination
-- p_status_filter: 'all' | 'verified' | 'unverified' | 'banned' | 'active'
-- Apply: supabase db query --linked -f scripts/admin-list-users-status-filter.sql

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

  IF v_order NOT IN ('created_at', 'balance', 'name') THEN
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
      u.email
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
      )
    ORDER BY
      CASE WHEN v_order = 'balance' THEN p.balance END DESC NULLS LAST,
      CASE WHEN v_order = 'name' THEN lower(COALESCE(p.name, p.username, '')) END ASC NULLS LAST,
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

-- Keep 5-arg overload (balance filter only)
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_order_by text DEFAULT 'created_at',
  p_balance_filter text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  RETURN public.admin_list_users(p_search, p_limit, p_offset, p_order_by, p_balance_filter, 'all');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text) TO authenticated;

-- 4-arg
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_order_by text DEFAULT 'created_at'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  RETURN public.admin_list_users(p_search, p_limit, p_offset, p_order_by, 'all', 'all');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text) TO authenticated;

-- 2-arg
CREATE OR REPLACE FUNCTION public.admin_list_users(
  p_search text DEFAULT '',
  p_limit int DEFAULT 50
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  RETURN public.admin_list_users(p_search, p_limit, 0, 'created_at', 'all', 'all');
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int) TO authenticated;
