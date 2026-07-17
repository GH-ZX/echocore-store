-- =============================================================================
-- Site logs: log sign-in / sign-up for EVERY user (not only admins)
-- Apply: supabase db query --linked -f scripts/site-logs-auth-all-users.sql
--
-- Root cause: log_auth_event always set actor/subject = auth.uid(). If that
-- user has no profiles row yet (race on first login / OAuth), the INSERT into
-- site_logs fails on FK (actor_user_id → profiles.id) and the event is lost.
-- Admin accounts always have a profile, so only their logins appeared.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.log_auth_event(
  p_event_type text,
  p_email text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_allowed text[] := ARRAY[
    'login_success', 'login_failed', 'logout', 'signup_success', 'signup_failed'
  ];
  v_severity text := 'info';
  v_meta jsonb;
  v_email text;
  v_name text;
  v_meta_user_id uuid;
BEGIN
  IF p_event_type IS NULL OR NOT (p_event_type = ANY(v_allowed)) THEN
    RETURN;
  END IF;

  v_email := lower(trim(COALESCE(p_email, '')));
  IF v_email = '' THEN
    v_email := NULL;
  END IF;

  v_meta := COALESCE(p_metadata, '{}'::jsonb);

  -- Optional client-supplied user id (when session JWT not ready yet)
  IF v_user_id IS NULL AND v_meta ? 'userId' AND nullif(trim(v_meta->>'userId'), '') IS NOT NULL THEN
    BEGIN
      v_meta_user_id := (trim(v_meta->>'userId'))::uuid;
      v_user_id := v_meta_user_id;
    EXCEPTION WHEN OTHERS THEN
      v_user_id := NULL;
    END;
  END IF;

  -- Resolve by email via auth.users when uid still unknown
  IF v_user_id IS NULL AND v_email IS NOT NULL THEN
    SELECT u.id INTO v_user_id
    FROM auth.users u
    WHERE lower(u.email) = v_email
    ORDER BY u.created_at DESC
    LIMIT 1;
  END IF;

  -- Email from auth.users when missing
  IF v_email IS NULL AND v_user_id IS NOT NULL THEN
    SELECT lower(u.email) INTO v_email
    FROM auth.users u
    WHERE u.id = v_user_id;
  END IF;

  -- Display name from profiles / metadata
  v_name := nullif(trim(COALESCE(v_meta->>'userName', v_meta->>'name', '')), '');
  IF v_name IS NULL AND v_user_id IS NOT NULL THEN
    SELECT nullif(trim(COALESCE(p.name, p.username, '')), '') INTO v_name
    FROM public.profiles p
    WHERE p.id = v_user_id;
  END IF;
  IF v_name IS NULL AND v_email IS NOT NULL THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  -- CRITICAL: only set actor/subject when a profiles row exists (FK on site_logs)
  IF v_user_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_user_id
  ) THEN
    v_user_id := NULL;
  END IF;

  -- Soft dedupe: same successful login within 30s (tab focus / double handlers)
  IF p_event_type = 'login_success' AND (v_user_id IS NOT NULL OR v_email IS NOT NULL) THEN
    IF EXISTS (
      SELECT 1
      FROM public.site_logs
      WHERE event_type = 'login_success'
        AND created_at > now() - interval '30 seconds'
        AND (
          (v_user_id IS NOT NULL AND actor_user_id = v_user_id)
          OR (v_email IS NOT NULL AND metadata->>'email' = v_email)
        )
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF p_event_type = 'login_failed' AND v_email IS NOT NULL THEN
    IF EXISTS (
      SELECT 1
      FROM public.site_logs
      WHERE event_type = 'login_failed'
        AND metadata->>'email' = v_email
        AND created_at > now() - interval '60 seconds'
    ) THEN
      RETURN;
    END IF;
  END IF;

  -- Soft dedupe signups (client + DB trigger may both fire)
  IF p_event_type = 'signup_success' AND (v_user_id IS NOT NULL OR v_email IS NOT NULL) THEN
    IF EXISTS (
      SELECT 1
      FROM public.site_logs
      WHERE event_type = 'signup_success'
        AND created_at > now() - interval '5 minutes'
        AND (
          (v_user_id IS NOT NULL AND actor_user_id = v_user_id)
          OR (v_email IS NOT NULL AND metadata->>'email' = v_email)
        )
    ) THEN
      RETURN;
    END IF;
  END IF;

  IF v_email IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('email', v_email);
  END IF;
  IF v_name IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('userName', v_name);
  END IF;
  IF v_user_id IS NOT NULL THEN
    v_meta := v_meta || jsonb_build_object('userId', v_user_id::text);
  END IF;
  -- Drop empty helper keys that confuse the log UI
  v_meta := v_meta - 'name';

  CASE p_event_type
    WHEN 'login_failed', 'signup_failed' THEN v_severity := 'warning';
    WHEN 'login_success', 'signup_success' THEN v_severity := 'success';
    ELSE v_severity := 'info';
  END CASE;

  BEGIN
    PERFORM public.append_site_log(
      'auth',
      p_event_type,
      v_severity,
      v_user_id,
      v_user_id,
      v_meta
    );
  EXCEPTION
    WHEN foreign_key_violation THEN
      -- Never lose the event if profile row is briefly missing
      PERFORM public.append_site_log(
        'auth',
        p_event_type,
        v_severity,
        NULL,
        NULL,
        v_meta
      );
    WHEN OTHERS THEN
      RAISE;
  END;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_auth_event(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_auth_event(text, text, jsonb) TO anon, authenticated;

-- Backup: log signup when a profile is created (covers OAuth / email confirm)
CREATE OR REPLACE FUNCTION public.log_profile_signup_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_email text;
  v_name text;
BEGIN
  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = NEW.id;

  v_name := nullif(trim(COALESCE(NEW.name, NEW.username, '')), '');
  IF v_name IS NULL AND v_email IS NOT NULL THEN
    v_name := split_part(v_email, '@', 1);
  END IF;

  -- Reuse log_auth_event so dedupe + FK safety apply
  PERFORM public.log_auth_event(
    'signup_success',
    v_email,
    jsonb_build_object(
      'userId', NEW.id::text,
      'userName', COALESCE(v_name, ''),
      'source', 'profile_insert'
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_log_signup ON public.profiles;
CREATE TRIGGER profiles_log_signup
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.log_profile_signup_event();

REVOKE EXECUTE ON FUNCTION public.log_profile_signup_event() FROM public;
