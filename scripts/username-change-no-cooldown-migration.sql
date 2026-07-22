-- Allow all authenticated users to change username freely (no weekly cooldown).
-- Uniqueness + format validation still enforced.

CREATE OR REPLACE FUNCTION public.change_username(p_new_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_row public.profiles%ROWTYPE;
  v_next text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found';
  END IF;

  v_next := public.validate_username_format(p_new_username);

  IF lower(COALESCE(v_row.username, '')) = v_next THEN
    RAISE EXCEPTION 'username_unchanged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = v_next
      AND id <> v_uid
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  UPDATE public.profiles
  SET
    username = v_next,
    username_changed_at = now()
  WHERE id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_next,
    'username_changed_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;
