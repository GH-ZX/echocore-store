-- Profile: optional gender + date_of_birth; username availability check for signup
-- Apply: supabase db query --linked -f scripts/profile-gender-dob-username-signup.sql
-- Existing users stay NULL for new columns (no backfill required).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS date_of_birth date;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_gender_check'
      AND conrelid = 'public.profiles'::regclass
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_gender_check
      CHECK (gender IS NULL OR gender IN ('male', 'female'));
  END IF;
END $$;

-- Public username availability probe (signup + settings before claim)
CREATE OR REPLACE FUNCTION public.check_username_available(p_username text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_raw text := lower(trim(COALESCE(p_username, '')));
  v_uid uuid := auth.uid();
BEGIN
  v_raw := regexp_replace(v_raw, '^@+', '');

  IF v_raw = '' THEN
    RETURN jsonb_build_object(
      'available', true,
      'empty', true,
      'username', ''
    );
  END IF;

  IF length(v_raw) < 4 OR length(v_raw) > 20 OR v_raw !~ '^[a-z][a-z0-9]*$' THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'username_invalid',
      'username', v_raw
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE lower(p.username) = v_raw
      AND (v_uid IS NULL OR p.id IS DISTINCT FROM v_uid)
  ) THEN
    RETURN jsonb_build_object(
      'available', false,
      'reason', 'username_taken',
      'username', v_raw
    );
  END IF;

  RETURN jsonb_build_object(
    'available', true,
    'empty', false,
    'username', v_raw
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.check_username_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.check_username_available(text) TO anon, authenticated;

-- Prefer username / gender / DOB from auth signup metadata when present
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text;
  v_username text;
  v_gender text;
  v_dob text;
  v_date date;
BEGIN
  v_name := NULLIF(trim(COALESCE(new.raw_user_meta_data->>'name', '')), '');
  v_username := lower(trim(COALESCE(new.raw_user_meta_data->>'username', '')));
  v_username := regexp_replace(COALESCE(v_username, ''), '^@+', '');
  v_gender := lower(trim(COALESCE(new.raw_user_meta_data->>'gender', '')));
  v_dob := nullif(trim(COALESCE(new.raw_user_meta_data->>'date_of_birth', '')), '');

  IF v_username = '' THEN
    v_username := NULL;
  ELSIF length(v_username) < 4
     OR length(v_username) > 20
     OR v_username !~ '^[a-z][a-z0-9]*$' THEN
    RAISE EXCEPTION 'username_invalid';
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p WHERE lower(p.username) = v_username
  ) THEN
    RAISE EXCEPTION 'username_taken';
  END IF;

  IF v_gender NOT IN ('male', 'female') THEN
    v_gender := NULL;
  END IF;

  IF v_dob IS NOT NULL THEN
    BEGIN
      v_date := v_dob::date;
      IF v_date > CURRENT_DATE OR v_date < (CURRENT_DATE - INTERVAL '120 years') THEN
        v_date := NULL;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_date := NULL;
    END;
  END IF;

  INSERT INTO public.profiles (id, role, name, username, gender, date_of_birth)
  VALUES (
    new.id,
    'user',
    v_name,
    v_username,
    v_gender,
    v_date
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN new;
END;
$$;

-- Allow users to set gender + date_of_birth on their own profile (username still via change_username)
-- No extra policy needed if "Users update own name" already allows column updates.
