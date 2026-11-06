-- Manual products and categories (2026-11-07).
-- A product (games row) can now be delivered by the store owner instead of G2Bulk:
--   delivery_mode 'manual', a delivery time and "how it's delivered" text, and the fields the
--   customer must fill at checkout (customer_fields). Its paid orders wait in
--   fulfillment_status 'awaiting_delivery' (before: 'skipped', which every screen showed as
--   delivered) until the owner delivers them (admin_deliver_order, optional delivery text shown
--   on the customer's invoice) or cancels them with a refund to the wallet (admin_cancel_manual_order).
-- Owner-defined categories group products on the storefront.

-- 1. Categories -------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  name_ar text NOT NULL CHECK (length(name_ar) BETWEEN 1 AND 80),
  name_en text NOT NULL CHECK (length(name_en) BETWEEN 1 AND 80),
  description_ar text CHECK (description_ar IS NULL OR length(description_ar) <= 500),
  description_en text CHECK (description_en IS NULL OR length(description_en) <= 500),
  image_url text CHECK (image_url IS NULL OR length(image_url) <= 1000),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  show_on_home boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Categories public read" ON public.categories;
CREATE POLICY "Categories public read" ON public.categories FOR SELECT USING (active OR public.is_admin());
DROP POLICY IF EXISTS "Admins manage categories" ON public.categories;
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;

-- 2. Products: category and delivery ----------------------------------------------------------
ALTER TABLE public.games
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delivery_mode text NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS delivery_eta_ar text,
  ADD COLUMN IF NOT EXISTS delivery_eta_en text,
  ADD COLUMN IF NOT EXISTS delivery_note_ar text,
  ADD COLUMN IF NOT EXISTS delivery_note_en text,
  ADD COLUMN IF NOT EXISTS customer_fields jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_delivery_mode_check;
ALTER TABLE public.games ADD CONSTRAINT games_delivery_mode_check CHECK (delivery_mode IN ('auto', 'manual'));
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_customer_fields_check;
ALTER TABLE public.games ADD CONSTRAINT games_customer_fields_check
  CHECK (jsonb_typeof(customer_fields) = 'array' AND jsonb_array_length(customer_fields) <= 10);
ALTER TABLE public.games DROP CONSTRAINT IF EXISTS games_delivery_text_check;
ALTER TABLE public.games ADD CONSTRAINT games_delivery_text_check CHECK (
  coalesce(length(delivery_eta_ar), 0) <= 80 AND coalesce(length(delivery_eta_en), 0) <= 80
  AND coalesce(length(delivery_note_ar), 0) <= 1000 AND coalesce(length(delivery_note_en), 0) <= 1000
);
CREATE INDEX IF NOT EXISTS games_category_id_idx ON public.games (category_id);

-- 3. "Waiting for the owner" ------------------------------------------------------------------
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_fulfillment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_fulfillment_status_check
  CHECK (fulfillment_status IN ('pending', 'skipped', 'fulfilling', 'fulfilled', 'failed', 'awaiting_delivery'));
ALTER TABLE public.order_items DROP CONSTRAINT IF EXISTS order_items_fulfillment_status_check;
ALTER TABLE public.order_items ADD CONSTRAINT order_items_fulfillment_status_check
  CHECK (fulfillment_status IS NULL OR fulfillment_status IN ('pending', 'fulfilling', 'fulfilled', 'failed', 'awaiting_delivery'));

-- 4. Checkout: manual products go alone, with their required answers ---------------------------
CREATE OR REPLACE FUNCTION public.check_manual_order_items(p_items jsonb)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_item jsonb;
  v_game public.games%ROWTYPE;
  v_field jsonb;
  v_has_manual boolean := false;
  v_has_auto boolean := false;
BEGIN
  FOR v_item IN SELECT * FROM jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  LOOP
    SELECT g.* INTO v_game
    FROM public.offers o JOIN public.games g ON g.id = o.game_id
    WHERE o.id = (v_item->>'offer_id')::uuid;
    IF v_game.id IS NULL THEN
      CONTINUE; -- create_order_atomic reports the unknown offer itself
    END IF;
    IF v_game.delivery_mode = 'manual' THEN
      v_has_manual := true;
      FOR v_field IN SELECT * FROM jsonb_array_elements(v_game.customer_fields)
      LOOP
        IF coalesce((v_field->>'required')::boolean, false)
           AND nullif(trim(coalesce(v_item->'customer_inputs'->>(v_field->>'key'), '')), '') IS NULL THEN
          RAISE EXCEPTION 'manual_input_required: %', coalesce(v_field->>'label_ar', v_field->>'key');
        END IF;
      END LOOP;
    ELSE
      v_has_auto := true;
    END IF;
  END LOOP;
  IF v_has_manual AND v_has_auto THEN
    RAISE EXCEPTION 'manual_products_separately';
  END IF;
END;
$$;

-- Only the answers the product asks for, as trimmed text (max 1,000 characters each).
CREATE OR REPLACE FUNCTION public.clean_customer_inputs(p_inputs jsonb, p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_fields jsonb;
  v_field jsonb;
  v_key text;
  v_value text;
  v_out jsonb := '{}'::jsonb;
BEGIN
  IF p_inputs IS NULL OR jsonb_typeof(p_inputs) <> 'object' THEN
    RETURN NULL;
  END IF;
  SELECT g.customer_fields INTO v_fields
  FROM public.offers o JOIN public.games g ON g.id = o.game_id
  WHERE o.id = p_offer_id AND g.delivery_mode = 'manual';
  IF v_fields IS NULL THEN
    RETURN NULL;
  END IF;
  FOR v_field IN SELECT * FROM jsonb_array_elements(v_fields)
  LOOP
    v_key := v_field->>'key';
    v_value := left(trim(coalesce(p_inputs->>v_key, '')), 1000);
    IF v_key IS NOT NULL AND v_value <> '' THEN
      v_out := v_out || jsonb_build_object(v_key, v_value);
    END IF;
  END LOOP;
  RETURN CASE WHEN v_out = '{}'::jsonb THEN NULL ELSE jsonb_build_object('inputs', v_out) END;
END;
$$;

REVOKE ALL ON FUNCTION public.check_manual_order_items(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clean_customer_inputs(jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_manual_order_items(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.clean_customer_inputs(jsonb, uuid) TO service_role;

-- create_order_atomic: re-created from its live definition with two additions only (the check
-- before pricing, and the answers stored on the order line). Grants are kept by CREATE OR REPLACE.
DO $do$
DECLARE
  v_sig regprocedure := 'public.create_order_atomic(uuid,numeric,text,jsonb,text,text,text,text)'::regprocedure;
  v_def text;
  v_new text;
BEGIN
  v_def := replace(pg_get_functiondef(v_sig), E'\r\n', E'\n');
  v_new := replace(v_def,
    E'  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)\n  LOOP\n    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>''quantity'')::integer, 1)));\n\n    SELECT price,',
    E'  PERFORM public.check_manual_order_items(p_items);\n\n  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)\n  LOOP\n    v_qty := GREATEST(1, LEAST(99, COALESCE((v_item->>''quantity'')::integer, 1)));\n\n    SELECT price,');
  IF v_new = v_def THEN RAISE EXCEPTION 'create_order_atomic: pricing loop not found'; END IF;
  v_def := v_new;
  v_new := replace(v_def,
    E'      player_uid, player_server, player_charname\n    ) VALUES (',
    E'      player_uid, player_server, player_charname, redemption_info\n    ) VALUES (');
  IF v_new = v_def THEN RAISE EXCEPTION 'create_order_atomic: order_items columns not found'; END IF;
  v_def := v_new;
  v_new := replace(v_def,
    E'      NULLIF(v_item->>''player_charname'', '''')\n    );',
    E'      NULLIF(v_item->>''player_charname'', ''''),\n      public.clean_customer_inputs(v_item->''customer_inputs'', (v_item->>''offer_id'')::uuid)\n    );');
  IF v_new = v_def THEN RAISE EXCEPTION 'create_order_atomic: order_items values not found'; END IF;
  EXECUTE v_new;
END
$do$;

-- Once a manual order is paid it waits for the owner. Done in the database (not only in the
-- g2bulk Edge Function) so a closed tab or a webhook-completed payment can't leave it 'pending'
-- or send it to the supplier.
CREATE OR REPLACE FUNCTION public.mark_manual_order_waiting(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.order_items oi
    JOIN public.offers o ON o.id = oi.offer_id
    JOIN public.games g ON g.id = o.game_id
    WHERE oi.order_id = p_order_id AND g.delivery_mode = 'manual'
  ) THEN
    RETURN;
  END IF;
  UPDATE public.orders SET fulfillment_status = 'awaiting_delivery', updated_at = now()
  WHERE id = p_order_id AND status = 'completed' AND coalesce(fulfillment_status, 'pending') = 'pending';
  IF FOUND THEN
    UPDATE public.order_items SET fulfillment_status = 'awaiting_delivery'
    WHERE order_id = p_order_id AND coalesce(fulfillment_status, 'pending') = 'pending';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.mark_manual_order_waiting(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_manual_order_waiting(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_manual_order_waiting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.mark_manual_order_waiting(CASE WHEN TG_TABLE_NAME = 'orders' THEN NEW.id ELSE NEW.order_id END);
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_manual_order_waiting() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS order_items_manual_waiting ON public.order_items;
CREATE TRIGGER order_items_manual_waiting AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.trg_manual_order_waiting();
DROP TRIGGER IF EXISTS orders_manual_waiting ON public.orders;
CREATE TRIGGER orders_manual_waiting AFTER UPDATE OF status ON public.orders
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION public.trg_manual_order_waiting();

-- 5. The owner delivers, or cancels with a refund -----------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_deliver_order(p_order_id uuid, p_delivery_text text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_text text := nullif(trim(coalesce(p_delivery_text, '')), '');
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF v_text IS NOT NULL AND length(v_text) > 4000 THEN
    RAISE EXCEPTION 'Delivery text is too long (max 4000 characters)';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'completed' OR v_order.fulfillment_status <> 'awaiting_delivery' THEN
    RAISE EXCEPTION 'Order is not waiting for delivery';
  END IF;

  UPDATE public.order_items
  SET fulfillment_status = 'fulfilled',
      delivery_items = CASE WHEN v_text IS NULL THEN delivery_items ELSE jsonb_build_array(v_text) END
  WHERE order_id = p_order_id;

  UPDATE public.orders
  SET fulfillment_status = 'fulfilled',
      updated_at = now(),
      g2bulk_metadata = coalesce(g2bulk_metadata, '{}'::jsonb)
        || jsonb_build_object('manual_delivered_at', now(), 'manual_delivered_by', auth.uid())
  WHERE id = p_order_id;

  PERFORM public.notify_user(v_order.user_id, 'order_fulfilled',
    jsonb_build_object('orderId', v_order.id, 'orderRef', v_order.order_ref, 'total', v_order.total, 'amount', v_order.total),
    '/success?orderId=' || v_order.id::text);
  PERFORM public.append_site_log('order', 'manual_delivered', 'success', auth.uid(), v_order.user_id,
    jsonb_build_object('orderId', v_order.id, 'orderRef', v_order.order_ref, 'withText', v_text IS NOT NULL));

  RETURN jsonb_build_object('ok', true, 'orderId', v_order.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_cancel_manual_order(p_order_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
  v_ref text;
  v_balance numeric;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF v_order.id IS NULL THEN
    RAISE EXCEPTION 'Order not found';
  END IF;
  IF v_order.status <> 'completed' OR v_order.fulfillment_status <> 'awaiting_delivery' THEN
    RAISE EXCEPTION 'Order is not waiting for delivery';
  END IF;

  v_ref := 'MANUAL-REFUND-' || coalesce(v_order.order_ref, v_order.id::text);
  IF EXISTS (SELECT 1 FROM public.transactions WHERE type = 'refund' AND reference = v_ref) THEN
    RAISE EXCEPTION 'Order was already refunded';
  END IF;

  UPDATE public.order_items SET fulfillment_status = 'failed' WHERE order_id = p_order_id;
  UPDATE public.orders
  SET fulfillment_status = 'failed',
      updated_at = now(),
      g2bulk_metadata = coalesce(g2bulk_metadata, '{}'::jsonb)
        || jsonb_build_object('manual_cancelled_at', now(), 'manual_cancelled_by', auth.uid(),
                              'manual_cancel_reason', v_reason, 'balance_refunded', v_order.total > 0,
                              'last_error', 'Cancelled by the store' || coalesce(': ' || v_reason, ''))
  WHERE id = p_order_id;

  IF v_order.total > 0 THEN
    PERFORM set_config('echocore.allow_balance_change', '1', true);
    UPDATE public.profiles SET balance = coalesce(balance, 0) + v_order.total
    WHERE id = v_order.user_id RETURNING balance INTO v_balance;
    INSERT INTO public.transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (v_order.user_id, 'refund', v_order.total, v_balance, 'balance', v_ref, 'completed');
  END IF;

  PERFORM public.notify_user(v_order.user_id, 'fulfillment_failed_refunded',
    jsonb_build_object('orderId', v_order.id, 'orderRef', v_order.order_ref, 'total', v_order.total,
                       'amount', v_order.total, 'newBalance', v_balance, 'reason', v_reason),
    '/profile');
  PERFORM public.append_site_log('order', 'manual_cancelled', 'warning', auth.uid(), v_order.user_id,
    jsonb_build_object('orderId', v_order.id, 'orderRef', v_order.order_ref, 'refunded', v_order.total));

  RETURN jsonb_build_object('ok', true, 'orderId', v_order.id, 'refunded', v_order.total, 'newBalance', v_balance);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_deliver_order(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_cancel_manual_order(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_deliver_order(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_cancel_manual_order(uuid, text) TO authenticated, service_role;
