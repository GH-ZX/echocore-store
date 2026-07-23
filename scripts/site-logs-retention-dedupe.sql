-- Site logs: 30-day retention, anti-spam dedupe, better admin list (severity + window)
-- Apply: supabase db query --linked -f scripts/site-logs-retention-dedupe.sql

-- ---------------------------------------------------------------------------
-- append_site_log: skip near-duplicate rows (same event within 90s)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.append_site_log(
  p_category text,
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_actor_user_id uuid DEFAULT NULL,
  p_subject_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_severity text := lower(trim(COALESCE(p_severity, 'info')));
  v_cat text := trim(COALESCE(p_category, ''));
  v_evt text := trim(COALESCE(p_event_type, ''));
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_order text;
  v_email text;
  v_window interval := interval '90 seconds';
BEGIN
  IF v_cat = '' OR v_evt = '' THEN
    RETURN NULL;
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity IN ('warn') THEN
    v_severity := 'warning';
  ELSIF v_severity IN ('ok', 'ok ') THEN
    v_severity := 'success';
  ELSIF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  -- Login success: longer dedupe window (SIGNED_IN + app login both fire)
  IF v_cat = 'auth' AND v_evt = 'login_success' THEN
    v_window := interval '3 minutes';
  END IF;

  v_order := nullif(trim(COALESCE(v_meta->>'orderId', v_meta->>'order_id', '')), '');
  v_email := lower(nullif(trim(COALESCE(v_meta->>'email', '')), ''));

  IF EXISTS (
    SELECT 1
    FROM public.site_logs sl
    WHERE sl.category = v_cat
      AND sl.event_type = v_evt
      AND sl.created_at > now() - v_window
      AND (
        (p_subject_user_id IS NOT NULL AND sl.subject_user_id IS NOT DISTINCT FROM p_subject_user_id)
        OR (p_actor_user_id IS NOT NULL AND sl.actor_user_id IS NOT DISTINCT FROM p_actor_user_id)
        OR (v_email IS NOT NULL AND lower(nullif(trim(sl.metadata->>'email'), '')) IS NOT DISTINCT FROM v_email)
        OR (
          p_subject_user_id IS NULL AND p_actor_user_id IS NULL AND v_email IS NULL
          AND sl.subject_user_id IS NULL AND sl.actor_user_id IS NULL
        )
      )
      AND (
        v_order IS NULL
        OR nullif(trim(COALESCE(sl.metadata->>'orderId', sl.metadata->>'order_id', '')), '')
           IS NOT DISTINCT FROM v_order
      )
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.site_logs (
    category, event_type, severity, actor_user_id, subject_user_id, metadata
  )
  VALUES (
    v_cat, v_evt, v_severity, p_actor_user_id, p_subject_user_id, v_meta
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_site_log(text, text, text, uuid, uuid, jsonb) FROM public;

-- ---------------------------------------------------------------------------
-- Purge rows older than 30 days (batched)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_site_logs(p_days int DEFAULT 30)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_days int := LEAST(GREATEST(COALESCE(p_days, 30), 7), 365);
  v_deleted int := 0;
BEGIN
  WITH doomed AS (
    SELECT id
    FROM public.site_logs
    WHERE created_at < now() - make_interval(days => v_days)
    ORDER BY created_at ASC
    LIMIT 2000
  )
  DELETE FROM public.site_logs sl
  USING doomed d
  WHERE sl.id = d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_site_logs(int) FROM public;
GRANT EXECUTE ON FUNCTION public.purge_old_site_logs(int) TO authenticated;

-- ---------------------------------------------------------------------------
-- Admin list: last 30 days only, severity filter, page size up to 100
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_admin_site_logs(int, int, text, text);
DROP FUNCTION IF EXISTS public.get_admin_site_logs(int, int, text);

CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL,
  p_severity text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_category text := nullif(trim(p_category), '');
  v_severity text := lower(nullif(trim(p_severity), ''));
  v_total bigint;
  v_logs jsonb;
  v_since timestamptz := now() - interval '30 days';
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Cheap retention (ignore failures / non-admin should not call purge from client often)
  BEGIN
    PERFORM public.purge_old_site_logs(30);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  ELSIF v_severity = 'critical_group' OR v_severity = 'critical' THEN
    v_severity := 'critical';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.site_logs sl
  WHERE sl.created_at >= v_since
    AND (v_category IS NULL OR sl.category = v_category)
    AND (
      v_severity IS NULL
      OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger'))
      OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
    );

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
      COALESCE(ap.name, ap.username, au.email::text, '') AS actor_name,
      COALESCE(sp.name, sp.username, su.email::text, '') AS subject_name
    FROM public.site_logs sl
    LEFT JOIN public.profiles ap ON ap.id = sl.actor_user_id
    LEFT JOIN auth.users au ON au.id = sl.actor_user_id
    LEFT JOIN public.profiles sp ON sp.id = sl.subject_user_id
    LEFT JOIN auth.users su ON su.id = sl.subject_user_id
    WHERE sl.created_at >= v_since
      AND (v_category IS NULL OR sl.category = v_category)
      AND (
        v_severity IS NULL
        OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger'))
        OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
      )
    ORDER BY sl.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'logs', v_logs,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset,
    'retentionDays', 30
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) TO authenticated;

-- 3-arg wrapper for older clients
CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN public.get_admin_site_logs(p_limit, p_offset, p_category, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) TO authenticated;
