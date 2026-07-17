-- =============================================================================
-- Restore false "failed" orders caused by G2Bulk poll timeout / edge abort.
-- These are NOT real supplier rejects — reset to pending so admin can re-fulfill.
-- Does NOT touch orders that already refunded the customer balance.
-- Apply: supabase db query --linked -f scripts/restore-soft-timeout-orders.sql
-- =============================================================================

-- Fix expire helper if it references missing updated_at
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

  -- Only fail STUCK fulfilling that is truly old — not soft mid-poll states under 15m
  UPDATE public.orders
  SET
    fulfillment_status = 'failed',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'last_error', 'Fulfillment stuck in fulfilling over 15 minutes',
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'fulfillment_stuck_fulfilling'
    )
  WHERE status = 'completed'
    AND fulfillment_status = 'fulfilling'
    AND created_at < v_cutoff
    AND COALESCE((g2bulk_metadata->>'balance_refunded')::boolean, false) = false;

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

-- Soft timeout / abort → pending (retryable). Skip refunded rows.
WITH restored AS (
  UPDATE public.orders
  SET
    fulfillment_status = 'pending',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'restored_from_soft_timeout', true,
        'restored_at', now(),
        'previous_error', g2bulk_metadata->>'last_error'
      )
      - 'last_error'
      - 'failed_at'
  WHERE status = 'completed'
    AND fulfillment_status = 'failed'
    AND COALESCE((g2bulk_metadata->>'balance_refunded')::boolean, false) = false
    AND (
      g2bulk_metadata->>'last_error' ILIKE '%timed out%'
      OR g2bulk_metadata->>'last_error' ILIKE '%timeout%'
      OR g2bulk_metadata->>'last_error' ILIKE '%still processing%'
      OR g2bulk_metadata->>'last_error' ILIKE '%aborted%'
      OR g2bulk_metadata->>'last_error' ILIKE '%abort%'
    )
  RETURNING id, order_ref
)
SELECT count(*) AS restored_count FROM restored;

-- Reset item-level failed from the same soft errors so re-fulfill can run
UPDATE public.order_items oi
SET fulfillment_status = 'pending'
FROM public.orders o
WHERE oi.order_id = o.id
  AND o.status = 'completed'
  AND o.fulfillment_status = 'pending'
  AND COALESCE((o.g2bulk_metadata->>'restored_from_soft_timeout')::boolean, false) = true
  AND oi.fulfillment_status = 'failed';
