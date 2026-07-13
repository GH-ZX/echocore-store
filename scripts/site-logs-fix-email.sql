-- Fix get_admin_site_logs: profiles has no email column (lives on auth.users)
-- Apply: supabase db query --linked -f scripts/site-logs-fix-email.sql

CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_category text := nullif(trim(p_category), '');
  v_total bigint;
  v_logs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.site_logs sl
  WHERE v_category IS NULL OR sl.category = v_category;

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT
      sl.id,
      sl.category,
      sl.event_type,
      sl.severity,
      sl.actor_user_id,
      sl.subject_user_id,
      sl.metadata,
      sl.created_at,
      COALESCE(ap.name, ap.username, au.email, '') AS actor_name,
      COALESCE(sp.name, sp.username, su.email, '') AS subject_name
    FROM public.site_logs sl
    LEFT JOIN public.profiles ap ON ap.id = sl.actor_user_id
    LEFT JOIN auth.users au ON au.id = sl.actor_user_id
    LEFT JOIN public.profiles sp ON sp.id = sl.subject_user_id
    LEFT JOIN auth.users su ON su.id = sl.subject_user_id
    WHERE v_category IS NULL OR sl.category = v_category
    ORDER BY sl.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'logs', v_logs,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) TO authenticated;