-- Starting an event wrote event_compare_price on every pack, including packs it never reprices.
-- An old row that breaks a NOT VALID check (the inactive probe pack from the 2026-11-03 incident,
-- price -1, kept as evidence) is re-checked on any update, so the whole start failed and rolled
-- back. The start now touches only the packs it reprices (supplier cost known, not on sale).
DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  v_def := replace(pg_get_functiondef('public.start_store_event_internal(uuid)'::regprocedure), E'\r\n', E'\n');

  v_new := replace(v_def,
    E'    UPDATE public.offers SET event_compare_price = price, event_saved_margin = NULL;\n',
    E'    UPDATE public.offers SET event_compare_price = price, event_saved_margin = NULL\n'
    || E'    WHERE g2bulk_cost_usd > 0 AND coalesce(is_sale, false) = false;\n');
  IF v_new = v_def THEN RAISE EXCEPTION 'start_store_event_internal: compare-price statement not found'; END IF;
  v_def := v_new;

  v_new := replace(v_def,
    E'    WHERE pricing_mode = ''margin'' AND pricing_margin_percent IS NOT NULL AND pricing_margin_percent > v_cap;\n',
    E'    WHERE pricing_mode = ''margin'' AND pricing_margin_percent IS NOT NULL AND pricing_margin_percent > v_cap\n'
    || E'      AND g2bulk_cost_usd > 0 AND coalesce(is_sale, false) = false;\n');
  IF v_new = v_def THEN RAISE EXCEPTION 'start_store_event_internal: margin statement not found'; END IF;

  EXECUTE v_new;
END
$do$;
