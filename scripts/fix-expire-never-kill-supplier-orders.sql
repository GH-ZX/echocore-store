-- =============================================================================
-- Never auto-fail orders that already have a G2Bulk supplier order id.
-- Those must be recovered by re-polling delivery, not marked failed (codes lost!).
-- Apply: supabase db query --linked -f scripts/fix-expire-never-kill-supplier-orders.sql
-- =============================================================================

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
  v_left_fulfilling int := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Abandoned unpaid checkouts only
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

  -- Do NOT mark fulfilling→failed when supplier order id exists (voucher codes /
  -- top-ups may complete after our poll window). Only note staleness for admin.
  UPDATE public.orders
  SET
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'stale_fulfilling', true,
      'stale_fulfilling_at', now(),
      'stale_note', 'Still awaiting supplier delivery — re-run fulfillOrder to recover codes'
    )
  WHERE status = 'completed'
    AND fulfillment_status = 'fulfilling'
    AND created_at < v_cutoff
    AND g2bulk_order_id IS NOT NULL
    AND length(trim(g2bulk_order_id)) > 0
    AND COALESCE((g2bulk_metadata->>'balance_refunded')::boolean, false) = false;

  GET DIAGNOSTICS v_left_fulfilling = ROW_COUNT;

  -- Only fail fulfilling with NO supplier id (never charged G2Bulk / lost state)
  UPDATE public.orders
  SET
    fulfillment_status = 'failed',
    g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb) || jsonb_build_object(
      'last_error', 'Fulfillment stuck without supplier order id',
      'auto_expired', true,
      'auto_expired_at', now(),
      'auto_expire_reason', 'fulfillment_stuck_no_supplier_id'
    )
  WHERE status = 'completed'
    AND fulfillment_status = 'fulfilling'
    AND created_at < v_cutoff
    AND (g2bulk_order_id IS NULL OR length(trim(g2bulk_order_id)) = 0)
    AND COALESCE((g2bulk_metadata->>'balance_refunded')::boolean, false) = false;

  RETURN jsonb_build_object(
    'cancelledPending', v_cancelled,
    'staleSupplierOrdersLeftFulfilling', v_left_fulfilling,
    'maxAgeMinutes', v_minutes,
    'cutoff', v_cutoff
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) FROM public;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_stale_pending_orders(int) TO service_role;

-- Restore EC-style false fails that still have supplier order id (codes recoverable)
UPDATE public.orders
SET
  fulfillment_status = 'fulfilling',
  g2bulk_metadata = COALESCE(g2bulk_metadata, '{}'::jsonb)
    || jsonb_build_object(
      'restored_for_code_recovery', true,
      'restored_at', now(),
      'previous_error', g2bulk_metadata->>'last_error'
    )
    - 'last_error'
    - 'failed_at'
    - 'auto_expired'
WHERE status = 'completed'
  AND fulfillment_status = 'failed'
  AND g2bulk_order_id IS NOT NULL
  AND length(trim(g2bulk_order_id)) > 0
  AND COALESCE((g2bulk_metadata->>'balance_refunded')::boolean, false) = false
  AND (
    g2bulk_metadata->>'last_error' ILIKE '%processing%'
    OR g2bulk_metadata->>'last_error' ILIKE '%stuck%'
    OR g2bulk_metadata->>'last_error' ILIKE '%timeout%'
    OR g2bulk_metadata->>'last_error' ILIKE '%timed out%'
    OR g2bulk_metadata->>'auto_expire_reason' = 'fulfillment_stuck_fulfilling'
  );
