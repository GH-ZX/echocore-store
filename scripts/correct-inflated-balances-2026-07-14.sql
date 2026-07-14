-- Correct inflated balances after balance-deduction trigger bug + false fulfillment refunds.
-- questice6326: $1 recharge − $0.91 purchase = $0.09
-- raidspin1047: $2 recharge − $1.71 purchases = $0.29

DO $$
DECLARE
  v_user_id uuid;
  v_old_balance numeric;
  v_new_balance numeric;
  v_delta numeric;
  v_username text;
BEGIN
  FOR v_username, v_new_balance IN
    SELECT * FROM (VALUES
      ('questice6326', 0.09::numeric),
      ('raidspin1047', 0.29::numeric)
    ) AS t(username, target_balance)
  LOOP
    SELECT id, balance
    INTO v_user_id, v_old_balance
    FROM public.profiles
    WHERE username = v_username;

    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'User not found: %', v_username;
    END IF;

    v_delta := v_new_balance - v_old_balance;

    IF v_delta = 0 THEN
      RAISE NOTICE 'Skip % — already at %', v_username, v_new_balance;
      CONTINUE;
    END IF;

    UPDATE public.profiles
    SET balance = v_new_balance
    WHERE id = v_user_id;

    INSERT INTO public.transactions (
      user_id,
      type,
      amount,
      balance_after,
      payment_method,
      reference,
      status
    )
    VALUES (
      v_user_id,
      'adjustment',
      v_delta,
      v_new_balance,
      'admin_correction',
      'BALANCE-FIX-20260714-' || upper(left(replace(v_user_id::text, '-', ''), 8)),
      'completed'
    );

    RAISE NOTICE 'Adjusted %: % -> % (delta %)', v_username, v_old_balance, v_new_balance, v_delta;
  END LOOP;
END $$;

SELECT username, balance
FROM public.profiles
WHERE username IN ('questice6326', 'raidspin1047');