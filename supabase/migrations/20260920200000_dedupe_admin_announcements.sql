-- =============================================================================
-- Migration: Deduplicate admin announcements
-- Prevents repeating rows on /dashboard/announcements when an announcement
-- is broadcast to all users (which creates 1 row per user in public.notifications).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_announcements(p_limit int DEFAULT 100)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT id, type, metadata, link, read_at, bell_hidden_at, created_at
      FROM (
        SELECT DISTINCT ON (
          type,
          COALESCE(metadata->>'title', ''),
          COALESCE(metadata->>'body', ''),
          date_trunc('minute', created_at)
        )
          id, type, metadata, link, read_at, bell_hidden_at, created_at
        FROM public.notifications
        WHERE type IN ('admin_announcement', 'admin_warning', 'admin_maintenance_notice')
        ORDER BY
          type,
          COALESCE(metadata->>'title', ''),
          COALESCE(metadata->>'body', ''),
          date_trunc('minute', created_at),
          created_at DESC
      ) deduped
      ORDER BY deduped.created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 100), 500))
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_announcements(int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_announcements(int) TO authenticated;
