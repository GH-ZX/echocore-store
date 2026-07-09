-- =============================================================================
-- ECHOCORE — Reset admin test wallet & commerce data (fresh start)
-- Run in Supabase SQL Editor when you want to clear test purchases/recharges.
-- Default target: admin.echocore3333@gmail.com (change v_email below if needed)
-- =============================================================================

DO $$
DECLARE
  v_email text := 'admin.echocore3333@gmail.com';
  v_user_id uuid;
BEGIN
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email);

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'No auth user found for email: %', v_email;
  END IF;

  DELETE FROM public.order_items
  WHERE order_id IN (SELECT id FROM public.orders WHERE user_id = v_user_id);

  DELETE FROM public.orders WHERE user_id = v_user_id;
  DELETE FROM public.transactions WHERE user_id = v_user_id;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recharge_requests'
  ) THEN
    EXECUTE 'DELETE FROM public.recharge_requests WHERE user_id = $1' USING v_user_id;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    EXECUTE 'DELETE FROM public.notifications WHERE user_id = $1' USING v_user_id;
  END IF;

  UPDATE public.profiles
  SET balance = 0
  WHERE id = v_user_id;

  RAISE NOTICE 'Reset complete for % (user_id=%). Store wallet set to $0.00', v_email, v_user_id;
END;
$$;