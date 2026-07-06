-- Atomic order creation RPC — fixes S2 (race condition) and S3 (client-side price trust)
-- Run this in Supabase SQL Editor.

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_user_id UUID,
  p_total NUMERIC,
  p_payment_method TEXT,
  p_items JSONB,
  p_player_uid TEXT DEFAULT NULL,
  p_player_server TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_balance NUMERIC;
  v_order_id UUID;
  v_item JSONB;
  v_offer_price NUMERIC;
  v_server_total NUMERIC := 0;
BEGIN
  -- ── 1. Verify each item's price against the offers table (S3 fix) ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT price INTO v_offer_price
    FROM offers
    WHERE id = (v_item->>'offer_id')::TEXT;

    IF v_offer_price IS NULL THEN
      RAISE EXCEPTION 'Offer not found: %', v_item->>'offer_id';
    END IF;

    -- Reject if client sent a different price
    IF ABS(v_offer_price - (v_item->>'price')::NUMERIC) > 0.001 THEN
      RAISE EXCEPTION 'Price mismatch for offer %: expected %, got %',
        v_item->>'offer_id', v_offer_price, v_item->>'price';
    END IF;

    v_server_total := v_server_total + v_offer_price;
  END LOOP;

  -- Guard: total must match server-computed sum
  IF ABS(v_server_total - p_total) > 0.001 THEN
    RAISE EXCEPTION 'Total mismatch: expected %, got %', v_server_total, p_total;
  END IF;

  -- ── 2. If paying with balance, do atomic deduction (S2 fix) ──
  IF p_payment_method = 'balance' THEN
    UPDATE profiles
    SET balance = balance - p_total
    WHERE id = p_user_id AND balance >= p_total
    RETURNING balance INTO v_new_balance;

    IF v_new_balance IS NULL THEN
      RAISE EXCEPTION 'Insufficient balance';
    END IF;

    INSERT INTO transactions (user_id, type, amount, balance_after, payment_method, reference, status)
    VALUES (p_user_id, 'purchase', -p_total, v_new_balance, 'balance', NULL, 'completed');
  ELSE
    SELECT balance INTO v_new_balance FROM profiles WHERE id = p_user_id;
  END IF;

  -- ── 3. Create order ──
  INSERT INTO orders (user_id, total, payment_method, status)
  VALUES (p_user_id, p_total, p_payment_method, 'completed')
  RETURNING id INTO v_order_id;

  -- ── 4. Insert order items ──
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    INSERT INTO order_items (order_id, offer_id, name_snapshot, price, quantity, player_uid, player_server)
    VALUES (
      v_order_id,
      (v_item->>'offer_id')::TEXT,
      v_item->>'name_snapshot',
      (v_item->>'price')::NUMERIC,
      COALESCE((v_item->>'quantity')::INTEGER, 1),
      NULLIF(v_item->>'player_uid', ''),
      NULLIF(v_item->>'player_server', '')
    );
  END LOOP;

  RETURN jsonb_build_object(
    'orderId', v_order_id,
    'newBalance', v_new_balance
  );
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION create_order_atomic(UUID, NUMERIC, TEXT, JSONB, TEXT, TEXT) TO authenticated;
