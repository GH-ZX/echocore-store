-- Security: a purchase can never raise a balance (2026-11-03 incident, EC-101565).
-- Every balance change writes a transactions row in the same DB transaction
-- (create_order_atomic, credit_user_balance, refunds, admin adjustments), so a
-- direction check here rolls back the whole operation if a bug ever produces a
-- "purchase" that adds money, or a recharge/refund that removes it.
-- Admin adjustments stay free in both directions.
-- NOT VALID keeps the incident row (+99 purchase) as evidence.

ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_amount_direction CHECK (
    (type = 'purchase' AND amount < 0)
    OR (type IN ('recharge', 'refund') AND amount > 0)
    OR type = 'adjustment'
  ) NOT VALID;
