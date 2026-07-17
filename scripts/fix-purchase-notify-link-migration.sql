-- =============================================================================
-- Paid-order admin notification must NOT look like delivery success.
-- Link to orders queue (not invoice). Invoice only after real fulfillment.
-- Apply: supabase db query --linked -f scripts/fix-purchase-notify-link-migration.sql
-- =============================================================================

CREATE OR REPLACE FUNCTION public.on_order_completed_notify_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_link text;
  v_event text;
BEGIN
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS NOT DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(nullif(trim(name), ''), nullif(trim(username), ''), 'Customer')
  INTO v_user_name
  FROM public.profiles
  WHERE id = NEW.user_id;

  -- Orders tab with highlight — not invoice (invoice only after fulfillment success)
  v_link := '/dashboard/orders?order=' || NEW.id::text;
  v_event := CASE
    WHEN NEW.payment_method = 'balance' THEN 'balance_paid'
    WHEN NEW.payment_method IN ('ShamCash', 'SyriatelCash') THEN 'sam_paid'
    ELSE 'completed'
  END;

  PERFORM public.notify_all_admins(
    'admin_purchase_completed',
    jsonb_build_object(
      'orderId', NEW.id,
      'orderRef', NEW.order_ref,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer'),
      'userId', NEW.user_id,
      'phase', 'payment'  -- payment only; delivery is a separate notification
    ),
    v_link
  );

  PERFORM public.try_append_site_log(
    'order',
    v_event,
    'info',
    NEW.user_id,
    NULL,
    jsonb_build_object(
      'orderId', NEW.id,
      'orderRef', NEW.order_ref,
      'total', NEW.total,
      'amount', NEW.total,
      'paymentMethod', NEW.payment_method,
      'userName', COALESCE(v_user_name, 'Customer')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_completed_notify_admins ON public.orders;
CREATE TRIGGER order_completed_notify_admins
  AFTER INSERT OR UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.on_order_completed_notify_admins();
