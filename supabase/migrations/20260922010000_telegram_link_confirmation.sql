-- Telegram link confirmation (fixes link-CSRF / session fixation)
-- A logged-in user opening an attacker's link must see WHICH Telegram account they are
-- linking and confirm explicitly; an existing link is never silently replaced.

ALTER TABLE public.telegram_link_tokens
  ADD COLUMN IF NOT EXISTS display_name text;

-- Read-only preview for the confirmation screen (does not consume the token).
CREATE OR REPLACE FUNCTION public.peek_telegram_link_token(p_token text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT jsonb_build_object('ok', true, 'display_name', COALESCE(display_name, ''))
     FROM public.telegram_link_tokens
     WHERE token = p_token AND used_at IS NULL AND expires_at > now()),
    jsonb_build_object('ok', false)
  );
$$;

REVOKE EXECUTE ON FUNCTION public.peek_telegram_link_token(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.peek_telegram_link_token(text) TO service_role;

CREATE OR REPLACE FUNCTION public.consume_telegram_link_token(p_token text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_chat_id text;
  v_existing text;
BEGIN
  -- Refuse to silently replace an existing link (user must /unlink first).
  SELECT telegram_chat_id INTO v_existing FROM public.profiles WHERE id = p_user_id;
  IF v_existing IS NOT NULL AND v_existing <> '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_linked');
  END IF;

  UPDATE public.telegram_link_tokens
  SET used_at = now()
  WHERE token = p_token
    AND used_at IS NULL
    AND expires_at > now()
  RETURNING chat_id INTO v_chat_id;

  IF v_chat_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_or_expired');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE telegram_chat_id = v_chat_id AND id <> p_user_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'chat_taken');
  END IF;

  UPDATE public.profiles
  SET telegram_chat_id = v_chat_id,
      telegram_linked_at = now()
  WHERE id = p_user_id;

  DELETE FROM public.telegram_link_tokens WHERE expires_at < now() - interval '1 day';

  RETURN jsonb_build_object('ok', true, 'chat_id', v_chat_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_telegram_link_token(text, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_telegram_link_token(text, uuid) TO service_role;
