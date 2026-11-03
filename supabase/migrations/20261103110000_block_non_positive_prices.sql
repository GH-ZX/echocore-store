-- Security: block non-positive prices (2026-11-03 incident, order EC-101565).
-- An attacker created an offer priced -1 via the g2bulk `ensureCatalogItems`
-- action and bought 99 of it, so create_order_atomic credited +99 to the
-- balance. These constraints make any such order fail and roll back no matter
-- which code path creates the offer or order.
-- NOT VALID keeps the incident rows as evidence while enforcing every new
-- insert/update.

ALTER TABLE public.offers
  ADD CONSTRAINT offers_price_positive CHECK (price > 0) NOT VALID;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_price_positive CHECK (price > 0) NOT VALID;

ALTER TABLE public.order_items
  ADD CONSTRAINT order_items_quantity_positive CHECK (quantity > 0) NOT VALID;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_total_non_negative CHECK (total >= 0) NOT VALID;
