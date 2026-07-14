-- =============================================================================
-- Admin recharge queue — Sam API vs legacy manual flow
-- Apply: supabase db query --linked -f scripts/admin-recharge-flow-migration.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_admin_recharge_requests(p_status text DEFAULT 'payment_sent')
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN COALESCE((
    SELECT json_agg(row_to_json(q) ORDER BY q.created_at DESC)
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
        p.name AS user_name,
        inv.sam_invoice_id,
        inv.sam_invoice_status,
        inv.sam_invoice_expires_at
      FROM recharge_requests r
      LEFT JOIN profiles p ON p.id = r.user_id
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
      WHERE (p_status IS NULL OR p_status = 'all' OR r.status = p_status)
      ORDER BY r.created_at DESC
      LIMIT 100
    ) q
  ), '[]'::json);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_recharge_requests(text) TO authenticated;