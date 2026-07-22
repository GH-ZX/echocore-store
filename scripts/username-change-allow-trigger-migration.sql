-- Username changes were blocked by protect_profile_sensitive_fields (NEW.username := OLD.username).
-- Allow change_username / admin_change_username RPCs via a session flag.

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_role text;
BEGIN
  -- Trusted RPCs (create_order_atomic, deduct_user_balance, etc.)
  IF current_setting('echocore.allow_balance_change', true) IN ('1', 'true') THEN
    RETURN NEW;
  END IF;

  -- Trusted username RPC (change_username / admin_change_username)
  IF current_setting('echocore.allow_username_change', true) IN ('1', 'true') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO caller_role FROM public.profiles WHERE id = auth.uid();

  IF caller_role = 'admin' THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.id THEN
    NEW.role := OLD.role;
    NEW.balance := OLD.balance;
    -- Block direct client writes to username (must use change_username RPC)
    NEW.username := OLD.username;
  END IF;

  RETURN NEW;
END;
$$;

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

  PERFORM set_config('echocore.allow_username_change', '1', true);

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

CREATE OR REPLACE FUNCTION public.admin_change_username(
  p_user_id uuid,
  p_new_username text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.profiles%ROWTYPE;
  v_next text;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  v_next := public.validate_username_format(p_new_username);

  IF lower(COALESCE(v_row.username, '')) = v_next THEN
    RAISE EXCEPTION 'username_unchanged';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(username) = v_next
      AND id <> p_user_id
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  PERFORM set_config('echocore.allow_username_change', '1', true);

  UPDATE public.profiles
  SET
    username = v_next,
    username_changed_at = now()
  WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_next,
    'username_changed_at', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.change_username(text) FROM public;
GRANT EXECUTE ON FUNCTION public.change_username(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.admin_change_username(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_change_username(uuid, text) TO authenticated;
