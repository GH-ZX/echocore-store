-- -----------------------------------------------------------------------------
-- Contact requires login + support threads match legacy logged-out emails
-- Applies to: public.submit_contact_message, public.get_my_contact_threads
-- Idempotent: both use CREATE OR REPLACE.
-- -----------------------------------------------------------------------------

-- 1) Reject anonymous submissions — contact now requires a signed-in account.
CREATE OR REPLACE FUNCTION public.submit_contact_message(
  p_name text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_honeypot text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text := lower(trim(COALESCE(p_email, '')));
  v_message text := trim(COALESCE(p_message, ''));
  v_name text := nullif(trim(COALESCE(p_name, '')), '');
  v_uid uuid := auth.uid();
  v_count int;
  v_id uuid;
BEGIN
  -- Honeypot: bots fill hidden fields — pretend success
  IF p_honeypot IS NOT NULL AND length(trim(p_honeypot)) > 0 THEN
    RETURN jsonb_build_object('ok', true, 'ignored', true);
  END IF;

  -- Contact requires a signed-in account
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'contact_login_required';
  END IF;

  IF v_email = '' OR v_message = '' THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  IF char_length(v_email) < 4 OR char_length(v_email) > 255
     OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+' THEN
    RAISE EXCEPTION 'contact_invalid_email';
  END IF;

  IF char_length(v_message) < 10 OR char_length(v_message) > 5000 THEN
    RAISE EXCEPTION 'contact_invalid_message';
  END IF;

  IF v_name IS NOT NULL AND char_length(v_name) > 120 THEN
    RAISE EXCEPTION 'contact_invalid_name';
  END IF;

  -- Rate limit: max 3 messages per email per rolling hour
  SELECT count(*)::int INTO v_count
  FROM public.contact_messages
  WHERE lower(email) = v_email
    AND created_at > now() - interval '1 hour';

  IF v_count >= 3 THEN
    RAISE EXCEPTION 'contact_rate_limited';
  END IF;

  -- Rate limit: max 5 messages per logged-in user per hour
  IF v_uid IS NOT NULL THEN
    SELECT count(*)::int INTO v_count
    FROM public.contact_messages
    WHERE user_id = v_uid
      AND created_at > now() - interval '1 hour';

    IF v_count >= 5 THEN
      RAISE EXCEPTION 'contact_rate_limited';
    END IF;
  END IF;

  INSERT INTO public.contact_messages (user_id, name, email, message, status)
  VALUES (v_uid, v_name, v_email, v_message, 'new')
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) TO authenticated;

-- 2) /support thread list: also include legacy messages sent with a matching
--    email while logged out (best-effort attach to the account).
CREATE OR REPLACE FUNCTION public.get_my_contact_threads(p_limit int DEFAULT 50, p_email text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_rows jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.sort_at DESC), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      s.id,
      s.name,
      s.email,
      s.message,
      s.status,
      s.created_at,
      s.last_reply_at,
      s.reply_count,
      s.sort_at
    FROM (
      SELECT
        cm.id,
        cm.name,
        cm.email,
        cm.message,
        cm.status,
        cm.created_at,
        (
          SELECT max(r.created_at)
          FROM public.contact_message_replies r
          WHERE r.contact_message_id = cm.id
        ) AS last_reply_at,
        (
          SELECT count(*)::int
          FROM public.contact_message_replies r
          WHERE r.contact_message_id = cm.id
        ) AS reply_count,
        COALESCE(
          (
            SELECT max(r.created_at)
            FROM public.contact_message_replies r
            WHERE r.contact_message_id = cm.id
          ),
          cm.created_at
        ) AS sort_at
      FROM public.contact_messages cm
      WHERE cm.user_id = auth.uid()
         OR (
              p_email IS NOT NULL
              AND p_email <> ''
              AND lower(cm.email) = lower(p_email)
            )
    ) s
    ORDER BY s.sort_at DESC
    LIMIT v_limit
  ) q;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_contact_threads(int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_contact_threads(int, text) TO authenticated;
