-- =============================================================================
-- Contact form hardening: submit only via RPC (honeypot + rate limits)
-- Apply: supabase db query --linked -f scripts/contact-rate-limit-migration.sql
-- =============================================================================

-- Index for rate-limit lookups by email
CREATE INDEX IF NOT EXISTS contact_messages_email_created_idx
  ON public.contact_messages (lower(email), created_at DESC);

CREATE INDEX IF NOT EXISTS contact_messages_user_created_idx
  ON public.contact_messages (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Block direct client inserts (bots used the open INSERT policy)
DROP POLICY IF EXISTS "Anyone can submit contact messages" ON public.contact_messages;

-- Optional: keep zero-row insert policy disabled — SECURITY DEFINER RPC only

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

  IF v_email = '' OR v_message = '' THEN
    RAISE EXCEPTION 'contact_required';
  END IF;

  IF char_length(v_email) < 4 OR char_length(v_email) > 255
     OR v_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
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
GRANT EXECUTE ON FUNCTION public.submit_contact_message(text, text, text, text) TO anon, authenticated;

COMMENT ON FUNCTION public.submit_contact_message(text, text, text, text) IS
  'Public contact form submit with honeypot + per-email/user rate limits. Direct table INSERT is not allowed for clients.';
