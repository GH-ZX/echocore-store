-- Auto-cancel abandoned recharge requests (لم يكمل stuck for hours/days).
-- Sam invoice webhooks should cancel on expiry; this is a safety net when
-- webhooks miss or the user never finishes.
-- Apply: supabase db query --linked -f scripts/expire-stale-recharges-migration.sql

CREATE OR REPLACE FUNCTION public.expire_stale_pending_recharges(
  p_max_age_minutes int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_minutes int := GREATEST(10, LEAST(COALESCE(p_max_age_minutes, 20), 1440));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  -- Admins, service role, or authenticated users (cleanup on recharge page load)
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    -- Allow any signed-in user to run cleanup (idempotent, no data leak)
    NULL;
  END IF;

  -- 1) pending/payment_sent with expired Sam invoice
  WITH expired_inv AS (
    SELECT DISTINCT r.id
    FROM public.recharge_requests r
    JOIN public.sam_invoices si
      ON si.entity_type = 'recharge'
     AND si.entity_id = r.id
    WHERE r.status IN ('pending', 'payment_sent')
      AND (
        COALESCE(si.status, '') IN ('expired', 'failed', 'cancelled')
        OR (si.expires_at IS NOT NULL AND si.expires_at <= now())
      )
  ),
  upd AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    FROM expired_inv e
    WHERE r.id = e.id
      AND r.status IN ('pending', 'payment_sent')
    RETURNING r.id
  )
  SELECT coalesce(array_agg(id), ARRAY[]::uuid[]) INTO v_ids FROM upd;

  v_cancelled := coalesce(array_length(v_ids, 1), 0);

  -- 2) Abandoned pending without a paid path — older than cutoff
  WITH stale AS (
    UPDATE public.recharge_requests r
    SET status = 'cancelled', updated_at = now()
    WHERE r.status = 'pending'
      AND r.created_at < v_cutoff
      AND r.id <> ALL (v_ids)
    RETURNING r.id
  )
  SELECT v_cancelled + coalesce((SELECT count(*)::int FROM stale), 0)
  INTO v_cancelled;

  -- Mark open Sam invoices as expired for cancelled recharges (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'recharge'
      AND si.entity_id IN (
        SELECT id FROM public.recharge_requests
        WHERE status = 'cancelled'
          AND updated_at > now() - interval '2 minutes'
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled', 'expired');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_recharges(int) TO service_role;

COMMENT ON FUNCTION public.expire_stale_pending_recharges(int) IS
  'Cancels abandoned pending recharges (expired Sam invoice or older than N minutes).';
