-- Clear mock / seed customer reviews so homepage shows only real approved opinions.
-- Safe to re-run. Does NOT delete user-submitted reviews (is_seed = false).

DELETE FROM public.customer_reviews
WHERE is_seed = true;

-- Optional: also remove any leftover approved seeds mis-flagged (names from old seed list)
-- Uncomment only if you need a hard wipe of those authors:
-- DELETE FROM public.customer_reviews
-- WHERE author_name IN (
--   'Khaled M.', 'Sara A.', 'Omar H.', 'Layla R.',
--   'Youssef K.', 'Nour T.', 'Rami S.', 'Maya L.'
-- );

SELECT
  count(*) FILTER (WHERE status = 'approved') AS approved_left,
  count(*) FILTER (WHERE status = 'pending') AS pending_left,
  count(*) AS total_left
FROM public.customer_reviews;
