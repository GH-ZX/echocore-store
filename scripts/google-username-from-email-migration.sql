-- =============================================================================
-- Google / OAuth signup: default username from email local-part
-- e.g. xxxxxx@gmail.com → username "xxxxxx" (sanitized + unique)
--
-- Run in Supabase SQL Editor.
-- Rules match app: ^[a-z][a-z0-9]*$ length 4–20
-- =============================================================================

-- Build a valid username seed from an email address (or empty if unusable).
CREATE OR REPLACE FUNCTION public.username_seed_from_email(p_email text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_local text;
  v_seed text;
BEGIN
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RETURN NULL;
  END IF;

  -- Local part before @; drop Gmail +tag
  v_local := split_part(lower(trim(p_email)), '@', 1);
  v_local := split_part(v_local, '+', 1);

  -- Keep only a-z0-9 (strip dots, underscores, etc.)
  v_seed := regexp_replace(v_local, '[^a-z0-9]', '', 'g');

  IF v_seed IS NULL OR v_seed = '' THEN
    RETURN NULL;
  END IF;

  -- Must start with a letter
  IF v_seed !~ '^[a-z]' THEN
    v_seed := 'u' || v_seed;
  END IF;

  -- Max 20 before uniqueness suffixes
  v_seed := left(v_seed, 20);

  -- Min length 4: pad with digits from a stable hash of the seed
  IF length(v_seed) < 4 THEN
    v_seed := rpad(v_seed, 4, '0');
  END IF;

  RETURN v_seed;
END;
$$;

-- Unique username: prefer email seed, else Echo_ random (legacy).
CREATE OR REPLACE FUNCTION public.generate_default_username(p_email text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_attempt int := 0;
  v_suffix text;
BEGIN
  v_base := public.username_seed_from_email(p_email);

  IF v_base IS NOT NULL AND v_base <> '' THEN
    -- Try exact seed, then seed + 2..digits
    LOOP
      v_attempt := v_attempt + 1;
      IF v_attempt = 1 THEN
        v_candidate := v_base;
      ELSE
        v_suffix := (v_attempt - 1)::text;
        v_candidate := left(v_base, greatest(1, 20 - length(v_suffix))) || v_suffix;
      END IF;

      EXIT WHEN NOT EXISTS (
        SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
      );

      IF v_attempt >= 40 THEN
        EXIT; -- fall through to random Echo_
      END IF;
    END LOOP;

    IF v_attempt < 40 THEN
      RETURN lower(v_candidate);
    END IF;
  END IF;

  -- Fallback: Echo_ + random (same style as before)
  v_attempt := 0;
  LOOP
    v_attempt := v_attempt + 1;
    v_candidate := 'echo' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));
    -- Ensure pattern ^[a-z][a-z0-9]*$ (no underscore)
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE lower(username) = lower(v_candidate)
    );
    IF v_attempt >= 24 THEN
      v_candidate := 'echo' || lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      EXIT;
    END IF;
  END LOOP;

  RETURN v_candidate;
END;
$$;

-- Before insert: if username empty, derive from email stored on profile... we don't
-- have email on profiles. handle_new_user sets username explicitly. This trigger
-- still fills gaps with random (no email available here).
CREATE OR REPLACE FUNCTION public.profiles_set_defaults()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.username IS NULL OR trim(NEW.username) = '' THEN
    NEW.username := public.generate_default_username(NULL);
  END IF;

  IF NEW.name IS NULL OR trim(NEW.name) = '' THEN
    NEW.name := NEW.username;
  END IF;

  RETURN NEW;
END;
$$;

-- New auth users (Google + email signup): username from metadata or email local-part
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
  v_email text;
BEGIN
  v_email := lower(trim(COALESCE(new.email, '')));
  v_name := NULLIF(trim(COALESCE(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'full name',
    ''
  )), '');

  -- Prefer explicit signup username (email form)
  v_username := lower(trim(COALESCE(new.raw_user_meta_data->>'username', '')));
  v_username := regexp_replace(COALESCE(v_username, ''), '^@+', '');

  IF v_username = '' THEN
    -- Google / OTP / no username chosen → from email (xxxxxx@gmail.com → xxxxxx)
    v_username := public.generate_default_username(v_email);
  ELSIF length(v_username) < 4
     OR length(v_username) > 20
     OR v_username !~ '^[a-z][a-z0-9]*$' THEN
    -- Invalid metadata: fall back to email-based instead of failing OAuth
    v_username := public.generate_default_username(v_email);
  ELSIF EXISTS (
    SELECT 1 FROM public.profiles p WHERE lower(p.username) = v_username
  ) THEN
    v_username := public.generate_default_username(v_email);
  END IF;

  v_gender := lower(trim(COALESCE(new.raw_user_meta_data->>'gender', '')));
  v_dob := nullif(trim(COALESCE(new.raw_user_meta_data->>'date_of_birth', '')), '');

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

  -- Display name: Google full name, else email local-part, else username
  IF v_name IS NULL OR v_name = '' THEN
    v_name := NULLIF(public.username_seed_from_email(v_email), '');
  END IF;
  IF v_name IS NULL OR v_name = '' THEN
    v_name := v_username;
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

-- Optional: backfill Google users who still have Echo_ random or empty username
-- and whose email local-part is free. Safe to re-run.
DO $$
DECLARE
  r record;
  v_seed text;
  v_next text;
BEGIN
  FOR r IN
    SELECT p.id, u.email, p.username
    FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE u.email IS NOT NULL
      AND (
        p.username IS NULL
        OR trim(p.username) = ''
        OR p.username ~* '^echo[0-9a-f]{6,}$'
        OR p.username ~* '^echo_'
      )
  LOOP
    v_seed := public.username_seed_from_email(r.email);
    IF v_seed IS NULL THEN
      CONTINUE;
    END IF;
    v_next := public.generate_default_username(r.email);
    IF v_next IS NOT NULL AND v_next <> '' THEN
      UPDATE public.profiles
      SET username = v_next
      WHERE id = r.id
        AND (username IS DISTINCT FROM v_next);
    END IF;
  END LOOP;
END $$;
