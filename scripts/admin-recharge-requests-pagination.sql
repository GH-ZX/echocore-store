-- Paginated admin recharge queue + wallet snapshot fields for expand panel
-- Returns { rows, total, limit, offset }
-- Apply: supabase db query --linked -f scripts/admin-recharge-requests-pagination.sql

CREATE OR REPLACE FUNCTION public.get_admin_recharge_requests(
  p_status text DEFAULT 'all',
  p_limit int DEFAULT 25,
  p_offset int DEFAULT 0
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
DECLARE
  v_status text := lower(trim(COALESCE(p_status, 'all')));
  v_limit int := GREATEST(1, LEAST(COALESCE(p_limit, 25), 100));
  v_offset int := GREATEST(0, COALESCE(p_offset, 0));
  v_total bigint := 0;
  v_rows json;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_status = '' THEN
    v_status := 'all';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.recharge_requests r
  WHERE (v_status = 'all' OR r.status = v_status);

  SELECT COALESCE(json_agg(row_to_json(q)), '[]'::json) INTO v_rows
  FROM (
    SELECT
      r.id,
      r.user_id,
      r.amount,
      r.reference,
      r.status,
      r.payment_method,
      r.admin_note,
      r.created_at,
      r.updated_at,
      r.reviewed_at,
      r.reviewed_by,
      r.pay_currency,
      r.syp_per_usd_snapshot,
      r.credited_amount,
      p.name AS user_name,
      p.username AS username,
      p.balance AS user_balance,
      u.email AS user_email,
      tx.balance_after,
      CASE
        WHEN tx.balance_after IS NOT NULL AND r.amount IS NOT NULL
          THEN (tx.balance_after - r.amount)
        ELSE NULL
      END AS balance_before,
      tx.created_at AS credited_at,
      inv.sam_invoice_id,
      inv.sam_invoice_status,
      inv.sam_invoice_expires_at
    FROM public.recharge_requests r
    LEFT JOIN public.profiles p ON p.id = r.user_id
    LEFT JOIN auth.users u ON u.id = r.user_id
    LEFT JOIN LATERAL (
      SELECT
        t.balance_after,
        t.created_at
      FROM public.transactions t
      WHERE t.user_id = r.user_id
        AND t.type IN ('recharge', 'adjustment')
        AND (
          (r.reference IS NOT NULL AND t.reference = r.reference)
          OR (
            r.status = 'approved'
            AND t.created_at BETWEEN r.created_at - interval '1 minute'
              AND COALESCE(r.reviewed_at, r.updated_at, r.created_at) + interval '10 minutes'
            AND t.amount > 0
          )
        )
      ORDER BY
        CASE WHEN r.reference IS NOT NULL AND t.reference = r.reference THEN 0 ELSE 1 END,
        t.created_at DESC
      LIMIT 1
    ) tx ON true
    LEFT JOIN LATERAL (
      SELECT
        si.sam_invoice_id,
        si.status AS sam_invoice_status,
        si.expires_at AS sam_invoice_expires_at
      FROM public.sam_invoices si
      WHERE si.entity_type = 'recharge'
        AND si.entity_id = r.id
      ORDER BY si.created_at DESC
      LIMIT 1
    ) inv ON true
    WHERE (v_status = 'all' OR r.status = v_status)
    ORDER BY r.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN json_build_object(
    'rows', v_rows,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_recharge_requests(text, int, int) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_recharge_requests(text, int, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_recharge_requests(p_status text DEFAULT 'all')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  RETURN public.get_admin_recharge_requests(p_status, 100, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) TO authenticated;
