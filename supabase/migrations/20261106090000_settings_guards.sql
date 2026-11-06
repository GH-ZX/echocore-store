-- Settings guards from the 2026-11-06 settings review.
-- 1. Maintenance mode was enforced only in the browser: Telegram bot orders, recharges and direct
--    RPC calls kept working. assert_store_open() now refuses new orders and recharge requests
--    while maintenance is on (admins excepted).
-- 2. Order invoices are USD only (sam-api); the invoice currency column is pinned to USD.
-- 3. Partner tiers need at least 3% markup (1% lost money when a supplier price rose during the
--    day); the "REI" tier's placeholder Arabic name is replaced.

CREATE OR REPLACE FUNCTION public.assert_store_open()
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce((SELECT maintenance_enabled FROM public.store_settings WHERE id = 1), false)
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'store_in_maintenance' USING ERRCODE = 'P0001';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_store_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_store_open() TO authenticated, service_role;

DO $do$
DECLARE
  v_sig regprocedure;
  v_def text;
  v_new text;
BEGIN
  -- create_order_atomic: right before the manual-product check (first statement after the auth checks)
  v_sig := 'public.create_order_atomic(uuid,numeric,text,jsonb,text,text,text,text)'::regprocedure;
  v_def := replace(pg_get_functiondef(v_sig), E'\r\n', E'\n');
  IF position('assert_store_open' in v_def) = 0 THEN
    v_new := replace(v_def, E'  PERFORM public.check_manual_order_items(p_items);',
      E'  PERFORM public.assert_store_open();\n  PERFORM public.check_manual_order_items(p_items);');
    IF v_new = v_def THEN RAISE EXCEPTION 'create_order_atomic: anchor not found'; END IF;
    EXECUTE v_new;
  END IF;

  -- telegram_create_order and create_recharge_request: first statement of the body
  FOREACH v_sig IN ARRAY ARRAY[
    'public.telegram_create_order(uuid,uuid,text,text,text)'::regprocedure,
    'public.create_recharge_request(numeric,text,text)'::regprocedure
  ]
  LOOP
    v_def := replace(pg_get_functiondef(v_sig), E'\r\n', E'\n');
    IF position('assert_store_open' in v_def) = 0 THEN
      v_new := regexp_replace(v_def, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM public.assert_store_open();\n');
      IF v_new = v_def THEN RAISE EXCEPTION '%: body start not found', v_sig; END IF;
      EXECUTE v_new;
    END IF;
  END LOOP;
END
$do$;

UPDATE public.store_settings SET sam_invoice_currency = 'USD' WHERE coalesce(sam_invoice_currency, '') <> 'USD';
ALTER TABLE public.store_settings DROP CONSTRAINT IF EXISTS store_settings_sam_invoice_currency_usd;
ALTER TABLE public.store_settings ADD CONSTRAINT store_settings_sam_invoice_currency_usd
  CHECK (sam_invoice_currency IS NULL OR sam_invoice_currency = 'USD');

UPDATE public.partner_tiers SET markup_percent = 3, updated_at = now() WHERE markup_percent < 3;
UPDATE public.partner_tiers SET name_ar = 'REI', updated_at = now()
WHERE name_ar = 'زيادة عالراسمال 6% مثلا';
ALTER TABLE public.partner_tiers DROP CONSTRAINT IF EXISTS partner_tiers_min_markup;
ALTER TABLE public.partner_tiers ADD CONSTRAINT partner_tiers_min_markup CHECK (markup_percent >= 3);
