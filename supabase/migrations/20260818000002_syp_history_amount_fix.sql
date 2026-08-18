-- =============================================================================
-- SYP HISTORY AMOUNT FIX (2026-08-18)
-- Admin "Sam API history" showed "10 SYP" instead of "134 SYP" for recharges
-- paid in SYP: the payload carried the USD amount (10) plus the invoice
-- currency label (SYP) with no rate to convert. This adds the missing fields:
--   • syp_per_usd_snapshot  — rate captured at recharge time (for conversion)
--   • requested_usd_amount  — the raw USD requested amount (already stored)
-- The client uses them to render the credited/requested amount in SYP.
-- Mirrors the merged copy in supabase_echocore_full.sql (§31 list_admin_recharge_history_rows).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_admin_recharge_history_rows(
  p_search text DEFAULT '',
  p_status text DEFAULT '',
  p_method text DEFAULT ''
)
RETURNS TABLE(id uuid, event_at timestamptz, row_data jsonb)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  WITH source_rows AS (
    SELECT
      si.id,
      COALESCE(r.user_id, si.user_id) AS user_id,
      r.id AS recharge_request_id,
      si.sam_invoice_id,
      si.payment_url,
      COALESCE(r.amount, si.requested_usd_amount, si.amount) AS requested_amount,
      si.paid_amount,
      COALESCE(si.currency, r.pay_currency, 'USD') AS currency,
      si.method,
      r.payment_method,
      r.status AS request_status,
      si.status AS payment_status,
       CASE WHEN credit.id IS NOT NULL OR r.credited_amount IS NOT NULL THEN 'credited' ELSE 'not_credited' END AS credit_status,
      si.transaction_ref,
      COALESCE(r.created_at, si.created_at) AS created_at,
      GREATEST(COALESCE(r.updated_at, r.created_at), COALESCE(si.updated_at, si.created_at)) AS event_at,
      COALESCE(credit.amount, r.credited_amount) AS credited_amount,
      r.reference,
      r.reviewed_at,
      si.paid_at,
      si.webhook_received_at,
      si.expires_at,
      COALESCE(si.syp_per_usd_snapshot, r.syp_per_usd_snapshot) AS syp_per_usd_snapshot,
      si.requested_usd_amount AS requested_usd_amount,
      p.name AS customer_name,
      p.username AS customer_username
    FROM public.sam_invoices si
    LEFT JOIN public.recharge_requests r ON r.id = si.entity_id
    LEFT JOIN public.profiles p ON p.id = COALESCE(r.user_id, si.user_id)
    LEFT JOIN LATERAL (
      SELECT t.id, t.amount
      FROM public.transactions t
      WHERE t.user_id = COALESCE(r.user_id, si.user_id)
         AND t.type IN ('recharge', 'adjustment')
         AND t.amount > 0
         AND t.status = 'completed'
         AND (
           t.reference = r.reference
           OR t.reference = si.transaction_ref
           OR t.reference = si.sam_invoice_id
           OR t.metadata->>'recharge_request_id' = r.id::text
           OR t.metadata->>'requestId' = r.id::text
           OR t.metadata->>'rechargeRequestId' = r.id::text
           OR t.metadata->>'sam_invoice_id' = si.sam_invoice_id
           OR (
             r.status = 'approved'
             AND r.reviewed_at IS NOT NULL
             AND t.type = 'adjustment'
             AND t.payment_method = 'admin_manual'
             AND t.amount = r.amount
             AND t.created_at >= r.created_at
             AND t.created_at <= r.reviewed_at
                AND NOT (COALESCE(t.metadata, '{}'::jsonb) ?| ARRAY[
                  'recharge_request_id', 'requestId', 'rechargeRequestId'
                ])
                AND NOT EXISTS (
                  SELECT 1
                  FROM public.recharge_requests competing
                  WHERE competing.user_id = r.user_id
                    AND competing.id <> r.id
                    AND competing.status = 'approved'
                    AND competing.reviewed_at IS NOT NULL
                    AND competing.amount = r.amount
                    AND t.created_at >= competing.created_at
                    AND t.created_at <= competing.reviewed_at
                    AND (
                      competing.created_at > r.created_at
                      OR (competing.created_at = r.created_at AND competing.id > r.id)
                    )
                )
              )
         )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 1
    ) credit ON true
    WHERE si.entity_type = 'recharge'
    UNION ALL
    SELECT
      r.id, r.user_id, r.id, NULL, NULL, r.amount, NULL, r.pay_currency, NULL,
      r.payment_method, r.status, NULL,
      CASE WHEN credit.id IS NOT NULL OR r.credited_amount IS NOT NULL THEN 'credited' ELSE 'not_credited' END,
      NULL, r.created_at, r.updated_at, COALESCE(credit.amount, r.credited_amount), r.reference, r.reviewed_at,
      NULL, NULL, NULL,
      r.syp_per_usd_snapshot,
      NULL AS requested_usd_amount,
      p.name, p.username
    FROM public.recharge_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN LATERAL (
      SELECT t.id, t.amount
      FROM public.transactions t
      WHERE t.user_id = r.user_id
         AND t.type IN ('recharge', 'adjustment')
         AND t.amount > 0
         AND t.status = 'completed'
         AND (
           t.reference = r.reference
           OR t.metadata->>'recharge_request_id' = r.id::text
           OR t.metadata->>'requestId' = r.id::text
           OR t.metadata->>'rechargeRequestId' = r.id::text
           OR (
             r.status = 'approved'
             AND r.reviewed_at IS NOT NULL
             AND t.type = 'adjustment'
             AND t.payment_method = 'admin_manual'
             AND t.amount = r.amount
             AND t.created_at >= r.created_at
             AND t.created_at <= r.reviewed_at
              AND NOT (COALESCE(t.metadata, '{}'::jsonb) ?| ARRAY[
                'recharge_request_id', 'requestId', 'rechargeRequestId'
              ])
              AND NOT EXISTS (
                SELECT 1
                FROM public.recharge_requests competing
                WHERE competing.user_id = r.user_id
                  AND competing.id <> r.id
                  AND competing.status = 'approved'
                  AND competing.reviewed_at IS NOT NULL
                  AND competing.amount = r.amount
                  AND t.created_at >= competing.created_at
                  AND t.created_at <= competing.reviewed_at
                  AND (
                    competing.created_at > r.created_at
                    OR (competing.created_at = r.created_at AND competing.id > r.id)
                  )
              )
            )
         )
      ORDER BY t.created_at DESC, t.id DESC
      LIMIT 1
    ) credit ON true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.sam_invoices si
      WHERE si.entity_type = 'recharge' AND si.entity_id = r.id
    )
  ), filtered AS (
    SELECT s.*
    FROM source_rows s
    WHERE (NULLIF(TRIM(p_status), '') IS NULL OR s.request_status = LOWER(TRIM(p_status))
      OR s.payment_status = LOWER(TRIM(p_status)) OR s.credit_status = LOWER(TRIM(p_status)))
      AND (NULLIF(TRIM(p_method), '') IS NULL OR s.method = LOWER(TRIM(p_method))
        OR LOWER(s.payment_method) = LOWER(TRIM(p_method)))
      AND (NULLIF(TRIM(p_search), '') IS NULL OR LOWER(CONCAT_WS(' ', s.customer_name, s.customer_username,
        s.user_id, s.recharge_request_id, s.reference, s.sam_invoice_id, s.transaction_ref)) LIKE '%' || LOWER(TRIM(p_search)) || '%')
  )
  SELECT f.id, f.event_at,
    JSONB_BUILD_OBJECT(
      'id', f.id, 'user_id', f.user_id, 'customer_id', f.user_id,
      'customer_name', f.customer_name, 'customer_username', f.customer_username,
      'recharge_request_id', f.recharge_request_id, 'reference', f.reference,
      'sam_invoice_id', f.sam_invoice_id, 'payment_url', f.payment_url,
      'requested_amount', f.requested_amount, 'paid_amount', f.paid_amount,
      'credited_amount', f.credited_amount, 'currency', f.currency,
      'method', COALESCE(f.method, 'manual'), 'payment_method', f.payment_method,
      'request_status', f.request_status, 'payment_status', f.payment_status,
      'credit_status', f.credit_status, 'transaction_ref', f.transaction_ref,
      'created_at', f.created_at, 'updated_at', f.event_at, 'reviewed_at', f.reviewed_at,
      'paid_at', f.paid_at, 'webhook_received_at', f.webhook_received_at, 'expires_at', f.expires_at,
      'syp_per_usd_snapshot', f.syp_per_usd_snapshot,
      'requested_usd_amount', f.requested_usd_amount
    )
  FROM filtered f;
$$;
