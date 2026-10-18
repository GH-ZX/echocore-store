-- Price rounding step (2026-10-18)
--
-- Store-wide "round customer prices up to the next X" for auto / custom-margin
-- packs, e.g. step 0.05 → $1.08 becomes $1.10. 0 = off (old behaviour: cents).
-- Applied by the g2bulk edge function on catalog sync and on the admin
-- "reprice now" action. Fixed-price and sale packs are never touched.
--
-- Every reprice first snapshots current prices so it can be undone from the
-- admin UI (restore_offer_prices) or SQL.

ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS g2bulk_price_round_step numeric(6,2) NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'store_settings_price_round_step_check'
  ) THEN
    ALTER TABLE public.store_settings
      ADD CONSTRAINT store_settings_price_round_step_check
      CHECK (g2bulk_price_round_step IN (0, 0.05, 0.10, 0.25, 0.50, 1.00));
  END IF;
END $$;

CREATE SCHEMA IF NOT EXISTS echocore_backup;
REVOKE ALL ON SCHEMA echocore_backup FROM public, anon, authenticated;

CREATE TABLE IF NOT EXISTS echocore_backup.offer_price_snapshots (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  offer_id uuid NOT NULL,
  price numeric NOT NULL,
  is_sale boolean,
  original_price numeric
);
CREATE INDEX IF NOT EXISTS offer_price_snapshots_label_idx
  ON echocore_backup.offer_price_snapshots (label);

-- Service role (edge function) only: snapshot every offer price under a label.
CREATE OR REPLACE FUNCTION public.snapshot_offer_prices(p_label text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, echocore_backup
AS $$
DECLARE
  v_n integer;
BEGIN
  IF coalesce(trim(p_label), '') = '' THEN
    RAISE EXCEPTION 'label required';
  END IF;
  INSERT INTO echocore_backup.offer_price_snapshots (label, offer_id, price, is_sale, original_price)
  SELECT p_label, o.id, o.price, o.is_sale, o.original_price FROM public.offers o;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.snapshot_offer_prices(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snapshot_offer_prices(text) TO service_role;

-- Admin: list recent snapshots (newest first).
CREATE OR REPLACE FUNCTION public.admin_list_offer_price_snapshots()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, echocore_backup
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN COALESCE((
    SELECT jsonb_agg(x ORDER BY x.taken_at DESC)
    FROM (
      SELECT label, max(taken_at) AS taken_at, count(*) AS offers
      FROM echocore_backup.offer_price_snapshots
      GROUP BY label
      ORDER BY max(taken_at) DESC
      LIMIT 20
    ) x
  ), '[]'::jsonb);
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_list_offer_price_snapshots() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_offer_price_snapshots() TO authenticated, service_role;

-- Admin: put every offer back to the prices in a snapshot (undo a reprice).
CREATE OR REPLACE FUNCTION public.admin_restore_offer_prices(p_label text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, echocore_backup
AS $$
DECLARE
  v_n integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.offers o
  SET price = s.price, is_sale = s.is_sale, original_price = s.original_price
  FROM (
    SELECT DISTINCT ON (offer_id) offer_id, price, is_sale, original_price
    FROM echocore_backup.offer_price_snapshots
    WHERE label = p_label
    ORDER BY offer_id, taken_at
  ) s
  WHERE o.id = s.offer_id
    AND (o.price IS DISTINCT FROM s.price
      OR o.is_sale IS DISTINCT FROM s.is_sale
      OR o.original_price IS DISTINCT FROM s.original_price);
  GET DIAGNOSTICS v_n = ROW_COUNT;

  PERFORM public.append_site_log(
    'admin', 'offer_prices_restored', 'info', auth.uid(), NULL,
    jsonb_build_object('label', p_label, 'offersChanged', v_n)
  );
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_restore_offer_prices(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_offer_prices(text) TO authenticated, service_role;

-- Baseline snapshot of live prices before any rounding is used.
SELECT public.snapshot_offer_prices('2026-10-18-before-price-rounding');
