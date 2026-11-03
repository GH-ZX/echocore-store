-- Security hardening after the 2026-11-03 incident (EC-101565): close the API the
-- way the store's tables are actually used, so a single wrong RLS policy can no
-- longer open money tables to the browser, and add money rules the database
-- enforces whatever the calling code does.

-- 1. API permissions ---------------------------------------------------------
-- Nobody writes through the API without an account (no write policy exists for
-- anon), and TRUNCATE/TRIGGER/REFERENCES are never needed by the browser.
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public FROM anon;

-- Money and system tables are written only by SECURITY DEFINER functions and
-- edge functions (service role). Signed-in users and admins keep reading them
-- through RLS, and keep direct writes only where the site does them: profiles,
-- games, offers, store_settings, customer_reviews, contact_messages,
-- contact_message_replies, sam_recipient_names (all still guarded by RLS).
REVOKE INSERT, UPDATE, DELETE ON
  public.orders,
  public.order_items,
  public.transactions,
  public.recharge_requests,
  public.sam_invoices,
  public.sam_transfers,
  public.binance_pay_orders,
  public.influencer_coupons,
  public.influencer_coupon_redemptions,
  public.notifications,
  public.notification_email_outbox,
  public.partner_invites,
  public.partner_tiers,
  public.purchase_idempotency,
  public.site_logs,
  public.public_offers
FROM authenticated;

-- Tables created later start closed too.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM authenticated;

-- 2. A balance never drops below zero -----------------------------------------
-- Four accounts carry deliberate debts from the August double-refund reclaims,
-- so this is a trigger, not a CHECK: a negative balance may be paid back (go up),
-- but nothing except an admin may push a balance below zero or deeper into debt.
-- A manual reclaim from the SQL editor first runs:
--   select set_config('echocore.allow_negative_balance', '1', true);
CREATE OR REPLACE FUNCTION public.block_balance_going_negative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.balance < 0
     AND NEW.balance < COALESCE(OLD.balance, 0)
     AND COALESCE(current_setting('echocore.allow_negative_balance', true), '') <> '1'
     AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Balance cannot go below zero (user %)', NEW.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_block_negative_balance ON public.profiles;
CREATE TRIGGER profiles_block_negative_balance
  BEFORE UPDATE OF balance ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.block_balance_going_negative();

-- 3. An order's total always equals its items ---------------------------------
-- Checked at commit, so create_order_atomic / admin_gift_order can insert the
-- order and then its items in the same transaction. All 1,572 existing orders
-- already match.
CREATE OR REPLACE FUNCTION public.check_order_total_matches_items()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_order_id uuid;
  v_total numeric;
  v_items numeric;
BEGIN
  IF TG_TABLE_NAME = 'orders' THEN
    v_order_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_order_id := OLD.order_id;
  ELSE
    v_order_id := NEW.order_id;
  END IF;

  SELECT o.total INTO v_total FROM public.orders o WHERE o.id = v_order_id;
  IF NOT FOUND THEN
    RETURN NULL; -- order deleted in the same transaction
  END IF;

  SELECT COALESCE(SUM(i.price * i.quantity), 0) INTO v_items
  FROM public.order_items i WHERE i.order_id = v_order_id;

  IF abs(v_total - v_items) > 0.01 THEN
    RAISE EXCEPTION 'Order % total % does not match its items %', v_order_id, v_total, v_items
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS orders_total_matches_items ON public.orders;
CREATE CONSTRAINT TRIGGER orders_total_matches_items
  AFTER INSERT OR UPDATE OF total ON public.orders
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_order_total_matches_items();

DROP TRIGGER IF EXISTS order_items_total_matches_order ON public.order_items;
CREATE CONSTRAINT TRIGGER order_items_total_matches_order
  AFTER INSERT OR UPDATE OF price, quantity OR DELETE ON public.order_items
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.check_order_total_matches_items();

-- 4. Quantity stays sane (largest real order line is 99) ----------------------
ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_max CHECK (quantity <= 100) NOT VALID;
