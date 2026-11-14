-- Test for 20261114080000_fix_manual_order_waiting_trigger.sql: an order that waited for payment
-- can be marked paid (confirm_order_payment, as the admin). Invented fixtures; rolled back.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;
INSERT INTO auth.users (id, email, aud, role) VALUES
  ('00000000-0000-4000-8000-0000000009a1', 'admin9@test.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-8000-0000000009c1', 'buyer9@test.invalid', 'authenticated', 'authenticated');
INSERT INTO public.profiles (id, role, name, balance) VALUES
  ('00000000-0000-4000-8000-0000000009a1', 'admin', 'Admin', 0),
  ('00000000-0000-4000-8000-0000000009c1', 'user', 'Buyer', 0)
ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;
INSERT INTO public.orders (id, user_id, total, payment_method, status)
VALUES ('00000000-0000-4000-8000-000000000901', '00000000-0000-4000-8000-0000000009c1', 10, 'ShamCash', 'payment_sent');
SELECT set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-0000000009a1', true);
SELECT public.confirm_order_payment('00000000-0000-4000-8000-000000000901', 'REF-9');
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  IF (SELECT status FROM public.orders WHERE id = '00000000-0000-4000-8000-000000000901') <> 'completed' THEN
    RAISE EXCEPTION 'FAIL m1: order not completed';
  END IF;
END $$;
SELECT 'manual_order_waiting fix: passed' AS result;
