-- Allow influencers to detect their own active codes (for profile/header badge)
-- Apply: supabase db query --linked -f scripts/influencer-self-read-migration.sql

DROP POLICY IF EXISTS "Influencers read own coupons" ON public.influencer_coupons;
CREATE POLICY "Influencers read own coupons" ON public.influencer_coupons
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR influencer_user_id = auth.uid()
  );

CREATE OR REPLACE FUNCTION public.get_my_influencer_status()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_code text;
  v_count int;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT count(*)::int, min(code)
  INTO v_count, v_code
  FROM public.influencer_coupons
  WHERE influencer_user_id = v_uid
    AND is_active = true
    AND (expires_at IS NULL OR expires_at >= now());

  IF v_count IS NULL OR v_count < 1 THEN
    RETURN jsonb_build_object('isInfluencer', false);
  END IF;

  RETURN jsonb_build_object(
    'isInfluencer', true,
    'codeCount', v_count,
    'primaryCode', v_code
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_influencer_status() FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_influencer_status() TO authenticated;
