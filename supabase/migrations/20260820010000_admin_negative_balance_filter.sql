-- Admin user list: add negative balance filter (الديون) to admin_list_users.
-- Mirrors the canonical definition in supabase_echocore_full.sql.

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
  v_order_by text := lower(trim(COALESCE(p_order_by, 'created_at')));
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_order_by NOT IN ('created_at', 'balance', 'total_spent', 'order_count', 'name', 'username') THEN
    v_order_by := 'created_at';
  END IF;

  RETURN (
    WITH filtered AS (
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
        p.sam_shamcash_wallet_id,
        p.sam_syriatel_recipient,
        p.created_at,
        u.email,
        COALESCE((SELECT SUM(o.total) FROM public.orders o WHERE o.user_id = p.id AND o.status = 'completed'), 0) AS total_spent,
        (SELECT COUNT(*)::int FROM public.orders o WHERE o.user_id = p.id AND o.status = 'completed') AS order_count
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
          lower(COALESCE(p_balance_filter, 'all')) = 'all'
          OR (lower(p_balance_filter) = 'positive' AND p.balance > 0)
          OR (lower(p_balance_filter) = 'zero' AND p.balance = 0)
          OR (lower(p_balance_filter) = 'negative' AND p.balance < 0)
        )
        AND (
          lower(COALESCE(p_status_filter, 'all')) = 'all'
          OR (lower(p_status_filter) = 'verified' AND p.verified_at IS NOT NULL)
          OR (lower(p_status_filter) = 'unverified' AND p.verified_at IS NULL)
          OR (lower(p_status_filter) = 'banned' AND p.banned_at IS NOT NULL AND (p.ban_expires_at IS NULL OR p.ban_expires_at > now()))
          OR (lower(p_status_filter) = 'active' AND (p.banned_at IS NULL OR (p.ban_expires_at IS NOT NULL AND p.ban_expires_at <= now())))
        )
    )
    SELECT json_build_object(
      'rows', COALESCE((
        SELECT json_agg(row_to_json(page))
        FROM (
          SELECT *
          FROM filtered
          ORDER BY
            CASE WHEN v_order_by = 'balance' THEN balance END DESC NULLS LAST,
            CASE WHEN v_order_by = 'total_spent' THEN total_spent END DESC NULLS LAST,
            CASE WHEN v_order_by = 'order_count' THEN order_count END DESC NULLS LAST,
            CASE WHEN v_order_by = 'name' THEN lower(COALESCE(name, '')) END ASC,
            CASE WHEN v_order_by = 'username' THEN lower(COALESCE(username, '')) END ASC,
            created_at DESC,
            id DESC
          LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 100))
          OFFSET GREATEST(0, COALESCE(p_offset, 0))
        ) page
      ), '[]'::json),
      'total', (SELECT COUNT(*) FROM filtered)
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, int, int, text, text, text) TO authenticated;