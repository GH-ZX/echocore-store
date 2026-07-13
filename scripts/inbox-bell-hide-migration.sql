-- Bell "clear/dismiss" hides notifications from the header dropdown only.
-- Main /notifications inbox keeps every item (invoices, receipts, history).
-- Run: supabase db query --linked -f scripts/inbox-bell-hide-migration.sql

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS bell_hidden_at timestamptz;

CREATE INDEX IF NOT EXISTS notifications_user_bell_visible_idx
  ON public.notifications (user_id, created_at DESC)
  WHERE bell_hidden_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_my_notifications(p_limit int DEFAULT 30)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::json;
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
    FROM (
      SELECT id, type, metadata, link, read_at, bell_hidden_at, created_at
      FROM public.notifications
      WHERE user_id = v_user_id
      ORDER BY created_at DESC
      LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100))
    ) q
  ), '[]'::json);
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_all_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_count int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET
    bell_hidden_at = now(),
    read_at = COALESCE(read_at, now())
  WHERE user_id = v_user_id
    AND bell_hidden_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_notification(p_notification_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated int;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.notifications
  SET
    bell_hidden_at = now(),
    read_at = COALESCE(read_at, now())
  WHERE id = p_notification_id
    AND user_id = v_user_id
    AND bell_hidden_at IS NULL;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;