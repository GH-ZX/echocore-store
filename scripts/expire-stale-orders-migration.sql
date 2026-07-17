-- Auto-close abandoned / stuck orders after 15 minutes.
-- Run: supabase db query --linked -f scripts/expire-stale-orders-migration.sql

CREATE OR REPLACE FUNCTION public.expire_stale_pending_orders(
  p_max_age_minutes int DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_minutes int := GREATEST(5, LEAST(COALESCE(p_max_age_minutes, 15), 120));
  v_cutoff timestamptz := now() - make_interval(mins => v_minutes);
  v_cancelled int := 0;
  v_fulfill_failed int := 0;
BEGIN
  -- Only admins or service role (edge) may run cleanup.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- 1) Unpaid / abandoned checkout attempts
  UPDATE public.orders
  SET
    status = 'cancelled',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'pending_over_15_minutes'
    )
  WHERE status IN ('pending_payment', 'payment_sent')
    AND created_at < v_cutoff;

  GET DIAGNOSTICS v_cancelled = ROW_COUNT;

  -- Cancel related open Sam invoices for those orders (best-effort)
  BEGIN
    UPDATE public.sam_invoices si
    SET status = 'expired'
    WHERE si.entity_type = 'order'
      AND si.entity_id IN (
        SELECT id FROM public.orders
        WHERE status = 'cancelled'
          AND COALESCE((g2bulk_metadata->>'auto_expired')::boolean, false) = true
          AND g2bulk_metadata->>'auto_expire_reason' = 'pending_over_15_minutes'
          AND created_at < v_cutoff
      )
      AND COALESCE(si.status, '') NOT IN ('paid', 'completed', 'cancelled');
  EXCEPTION
    WHEN undefined_table THEN NULL;
    WHEN undefined_column THEN NULL;
    WHEN OTHERS THEN NULL;
  END;

  -- 2) Only fail actively stuck "fulfilling" — never bare pending/null
  -- (those are often successful legacy completed sales without tracking).
  UPDATE public.orders
  SET
    fulfillment_status = 'failed',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'last_error', 'Fulfillment timed out after 15 minutes',
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'fulfillment_stuck_fulfilling'
    )
  WHERE status = 'completed'
    AND fulfillment_status = 'fulfilling'
    AND COALESCE(updated_at, created_at) < v_cutoff;

  GET DIAGNOSTICS v_fulfill_failed = ROW_COUNT;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'failedStuckFulfillment', v_fulfill_failed,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) TO service_role;

COMMENT ON FUNCTION public.expire_stale_pending_orders(int) IS
  'Cancels unpaid orders older than N minutes and marks stuck fulfillments as failed.';
