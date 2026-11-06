-- Block throwaway email domains at sign-up (2026-11-06).
-- The attacker behind the 2026-11-03 incident keeps signing up with disposable inboxes
-- (fldubai.com, mailinator.com). A BEFORE INSERT trigger on auth.users refuses those domains
-- (and their subdomains), so a script calling the Auth API directly is stopped too; the sign-up
-- page asks email_domain_blocked() first to show a clear message.
-- Add a domain: INSERT INTO public.blocked_email_domains (domain, reason) VALUES ('x.com', '…');

CREATE TABLE IF NOT EXISTS public.blocked_email_domains (
  domain text PRIMARY KEY CHECK (domain = lower(domain) AND domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.blocked_email_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage blocked domains" ON public.blocked_email_domains;
CREATE POLICY "Admins manage blocked domains" ON public.blocked_email_domains FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
REVOKE ALL ON public.blocked_email_domains FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.blocked_email_domains TO authenticated;
GRANT ALL ON public.blocked_email_domains TO service_role;

INSERT INTO public.blocked_email_domains (domain, reason) VALUES
  ('fldubai.com', 'Used by the 2026-11 attacker'),
  ('mailinator.com', 'Used by the 2026-11 attacker'),
  ('guerrillamail.com', 'Disposable inbox'),
  ('sharklasers.com', 'Disposable inbox'),
  ('yopmail.com', 'Disposable inbox'),
  ('10minutemail.com', 'Disposable inbox'),
  ('temp-mail.org', 'Disposable inbox'),
  ('tempmail.com', 'Disposable inbox'),
  ('trashmail.com', 'Disposable inbox'),
  ('getnada.com', 'Disposable inbox'),
  ('dispostable.com', 'Disposable inbox'),
  ('maildrop.cc', 'Disposable inbox'),
  ('throwawaymail.com', 'Disposable inbox')
ON CONFLICT (domain) DO NOTHING;

-- true when the email's domain (or a parent domain) is blocked
CREATE OR REPLACE FUNCTION public.email_domain_blocked(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.blocked_email_domains b
    WHERE lower(split_part(trim(coalesce(p_email, '')), '@', 2)) = b.domain
       OR lower(split_part(trim(coalesce(p_email, '')), '@', 2)) LIKE '%.' || b.domain
  );
$$;
REVOKE ALL ON FUNCTION public.email_domain_blocked(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_domain_blocked(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.block_throwaway_email_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.email IS NOT DISTINCT FROM OLD.email THEN
    RETURN NEW; -- sign-ins and other updates of existing accounts are never blocked here
  END IF;
  IF NEW.email IS NOT NULL AND public.email_domain_blocked(NEW.email) THEN
    RAISE EXCEPTION 'email_domain_blocked' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.block_throwaway_email_signup() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS block_throwaway_email_signup ON auth.users;
CREATE TRIGGER block_throwaway_email_signup BEFORE INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.block_throwaway_email_signup();
