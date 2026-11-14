-- Fix (2026-11-14): paid orders that were waiting for payment could not be completed.
-- trg_manual_order_waiting (20261107090000) is shared by orders and order_items and read
-- NEW.order_id inside one CASE expression; on the orders table that field does not exist, so every
-- UPDATE of an order to status 'completed' failed ("record "new" has no field "order_id"").
-- Hit: admin approval of a manual ShamCash order payment (confirm_order_payment) and Sam API paid
-- orders (complete_order_from_sam_invoice). Wallet orders are inserted as completed: not affected.
-- Self-contained: can be applied on its own, before 20261114090000 / 20261114100000.
-- Rollback: re-run the function from 20261107090000 (it is the broken version), not needed otherwise.

CREATE OR REPLACE FUNCTION public.trg_manual_order_waiting()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    PERFORM public.mark_manual_order_waiting(NEW.id);
  ELSE
    PERFORM public.mark_manual_order_waiting((to_jsonb(NEW)->>'order_id')::uuid);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_manual_order_waiting() FROM PUBLIC, anon, authenticated;
