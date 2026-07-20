-- DEPRECATED: mock reviews are no longer seeded for production storefronts.
-- Homepage should only show customer reviews that admins approve.
--
-- To clear existing seeds:
--   \i scripts/clear-seed-customer-reviews.sql
-- or run scripts/customer-review-admin-notify-migration.sql

DELETE FROM public.customer_reviews WHERE is_seed = true;
