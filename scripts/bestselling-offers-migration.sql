-- Public bestsellers for home “Suggested offers” (top N by completed order qty)
-- Apply: supabase db query --linked -f scripts/bestselling-offers-migration.sql

CREATE OR REPLACE FUNCTION public.get_bestselling_offer_ids(p_limit integer DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_lim integer := GREATEST(1, LEAST(50, COALESCE(p_limit, 10)));
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(x)::jsonb ORDER BY x.units DESC, x.offer_id)
    FROM (
      SELECT
        oi.offer_id,
        SUM(GREATEST(1, COALESCE(oi.quantity, 1)))::bigint AS units
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      JOIN public.offers off ON off.id = oi.offer_id
      WHERE o.status = 'completed'
        AND COALESCE(o.payment_method, '') IS DISTINCT FROM 'admin_gift'
        AND oi.offer_id IS NOT NULL
        AND off.active IS NOT FALSE
      GROUP BY oi.offer_id
      ORDER BY units DESC, oi.offer_id
      LIMIT v_lim
    ) x
  ), '[]'::jsonb);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_bestselling_offer_ids(integer) FROM public;
GRANT EXECUTE ON FUNCTION public.get_bestselling_offer_ids(integer) TO anon, authenticated;
