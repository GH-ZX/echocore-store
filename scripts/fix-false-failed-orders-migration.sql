-- 1) Stop marking successful legacy completed orders as failed.
-- 2) Restore orders wrongly failed by fulfillment_over_15_minutes auto-expire.
-- Run: supabase db query --linked -f scripts/fix-false-failed-orders-migration.sql

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
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Unpaid / abandoned checkouts only
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

  -- Only fail actively stuck "fulfilling" (in-flight), never bare "pending"
  -- (pending often means legacy completed sales without supplier tracking).
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

-- Restore orders wrongly marked failed by the previous blanket pending→failed expire.
UPDATE public.orders
SET
  fulfillment_status = 'fulfilled',
  g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
    'restored_from_false_expire', true,
    'restored_at', now()
  )
WHERE status = 'completed'
  AND fulfillment_status = 'failed'
  AND (
    g2bulk_metadata->>'auto_expire_reason' = 'fulfillment_over_15_minutes'
    OR (
      COALESCE((g2bulk_metadata->>'auto_expired')::boolean, false) = true
      AND g2bulk_metadata->>'last_error' ILIKE '%timed out after 15 minutes%'
    )
  );

-- Also clear false auto-failed when last_error is only the timeout message
-- and order was completed long ago without a real supplier error trail.
UPDATE public.orders
SET
  fulfillment_status = 'fulfilled',
  g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
    'restored_from_false_expire', true,
    'restored_at', now()
  )
WHERE status = 'completed'
  AND fulfillment_status = 'failed'
  AND g2bulk_metadata->>'last_error' = 'Fulfillment timed out after 15 minutes';
