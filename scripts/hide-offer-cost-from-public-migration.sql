-- =============================================================================
-- Hide supplier wholesale cost from public/anon PostgREST reads.
-- - Column privileges: g2bulk_cost_usd (and pricing_margin_percent) not selectable
--   by anon/authenticated direct table queries
-- - admin_get_offer_wholesale: admin-only cost + pricing policy fields
-- - get_my_offer_unit_prices: partner / influencer display prices without cost
--
-- Apply: supabase db query --linked -f scripts/hide-offer-cost-from-public-migration.sql
-- (or paste into Supabase SQL Editor)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Column-level SELECT: all offer columns except wholesale secrets
--    (table-level SELECT grants all columns; we must revoke then re-grant)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(c.column_name), ', ' ORDER BY c.ordinal_position)
  INTO cols
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
    AND c.table_name = 'offers'
    AND c.column_name NOT IN (
      'g2bulk_cost_usd',
      -- With public price + margin %, cost is reverse-engineerable
      'pricing_margin_percent'
    );

  IF cols IS NULL OR length(trim(cols)) = 0 THEN
    RAISE EXCEPTION 'hide-offer-cost: no public columns resolved for offers';
  END IF;

  REVOKE SELECT ON TABLE public.offers FROM anon, authenticated;
  EXECUTE format(
    'GRANT SELECT (%s) ON TABLE public.offers TO anon, authenticated',
    cols
  );

  -- Admins still INSERT/UPDATE/DELETE via RLS; keep DML privileges
  GRANT INSERT, UPDATE, DELETE ON TABLE public.offers TO authenticated;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Admin: wholesale map (SECURITY DEFINER — full row access as owner)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_offer_wholesale(p_ids uuid[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      o.id::text,
      jsonb_build_object(
        'g2bulk_cost_usd', o.g2bulk_cost_usd,
        'pricing_mode', o.pricing_mode,
        'pricing_margin_percent', o.pricing_margin_percent
      )
    ),
    '{}'::jsonb
  )
  INTO v_out
  FROM public.offers o
  WHERE p_ids IS NULL
     OR cardinality(p_ids) IS NULL
     OR cardinality(p_ids) = 0
     OR o.id = ANY (p_ids);

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_get_offer_wholesale(uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.admin_get_offer_wholesale(uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Shopper unit prices (partner plan-B / influencer) without exposing cost
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_offer_unit_prices(
  p_ids uuid[] DEFAULT NULL,
  p_influencer_code text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_partner_markup numeric := NULL;
  v_buyer_markup numeric := NULL;
  v_inf_margin numeric := NULL;
  v_code text := nullif(upper(trim(COALESCE(p_influencer_code, ''))), '');
  v_out jsonb := '{}'::jsonb;
  r record;
  v_public numeric;
  v_cost numeric;
  v_unit numeric;
  v_partner boolean;
  v_influencer boolean;
BEGIN
  -- Anonymous / logged-out: public shelf only (no special pricing)
  IF v_uid IS NOT NULL THEN
    SELECT t.markup_percent INTO v_partner_markup
    FROM public.profiles p
    JOIN public.partner_tiers t ON t.id = p.partner_tier_id
    WHERE p.id = v_uid
      AND t.is_active = true;

    IF v_partner_markup IS NULL AND v_code IS NOT NULL THEN
      BEGIN
        v_code := regexp_replace(v_code, '\s+', '', 'g');
        SELECT c.buyer_markup_percent, c.influencer_margin_percent
        INTO v_buyer_markup, v_inf_margin
        FROM public.influencer_coupons c
        WHERE upper(trim(c.code)) = v_code
          AND COALESCE(c.is_active, true) = true
          AND (c.expires_at IS NULL OR c.expires_at > now())
        LIMIT 1;
      EXCEPTION
        WHEN undefined_table THEN
          v_buyer_markup := NULL;
          v_inf_margin := NULL;
        WHEN undefined_column THEN
          v_buyer_markup := NULL;
          v_inf_margin := NULL;
      END;
    END IF;
  END IF;

  FOR r IN
    SELECT o.id, o.price, o.g2bulk_cost_usd
    FROM public.offers o
    WHERE (p_ids IS NULL OR cardinality(p_ids) IS NULL OR cardinality(p_ids) = 0 OR o.id = ANY (p_ids))
      AND COALESCE(o.active, true) = true
  LOOP
    v_public := COALESCE(r.price, 0);
    v_cost := r.g2bulk_cost_usd;
    v_unit := v_public;
    v_partner := false;
    v_influencer := false;

    IF v_partner_markup IS NOT NULL AND v_cost IS NOT NULL AND v_cost > 0 THEN
      BEGIN
        v_unit := public.partner_price_from_cost(v_cost, v_partner_markup);
      EXCEPTION
        WHEN undefined_function THEN
          v_unit := v_public;
      END;
      IF v_unit IS NULL OR v_unit > v_public THEN
        v_unit := v_public;
      END IF;
      IF v_unit < v_public - 0.0001 THEN
        v_partner := true;
      END IF;
    ELSIF v_buyer_markup IS NOT NULL AND v_cost IS NOT NULL AND v_cost > 0 THEN
      BEGIN
        v_unit := public.influencer_buyer_price(v_public, v_cost, v_buyer_markup);
      EXCEPTION
        WHEN undefined_function THEN
          v_unit := v_public;
      END;
      IF v_unit IS NULL THEN
        v_unit := v_public;
      END IF;
      IF v_unit < v_public - 0.0001 THEN
        v_influencer := true;
      END IF;
    END IF;

    v_out := v_out || jsonb_build_object(
      r.id::text,
      jsonb_build_object(
        'unitPrice', v_unit,
        'publicPrice', v_public,
        'partnerPriced', v_partner,
        'influencerPriced', v_influencer
      )
    );
  END LOOP;

  RETURN v_out;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_my_offer_unit_prices(uuid[], text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_my_offer_unit_prices(uuid[], text) TO authenticated;
-- Partners must be logged in; anon only needs public price from table

COMMENT ON FUNCTION public.admin_get_offer_wholesale(uuid[]) IS
  'Admin-only map of offer id → g2bulk_cost_usd + pricing policy (never expose to clients directly).';
COMMENT ON FUNCTION public.get_my_offer_unit_prices(uuid[], text) IS
  'Returns unit prices for current user (partner / influencer) without revealing supplier cost.';
