-- Seed storefront customer reviews (safe to re-run: replaces prior seed rows only)
DELETE FROM public.customer_reviews WHERE is_seed = true;

INSERT INTO public.customer_reviews (author_name, content, rating, status, is_seed, sort_order)
VALUES
  ('Khaled M.', 'توصيل سريع وأسعار ممتازة. شحنت VP لفالورانت خلال أقل من دقيقة.', 5, 'approved', true, 1),
  ('Sara A.', 'واجهة المتجر جميلة والدفع سلس. ShamCash اشتغل بدون أي مشكلة.', 5, 'approved', true, 2),
  ('Omar H.', 'أفضل أسعار لقيتها لشحن الألعاب. الدعم رد بسرعة على الديسكورد.', 5, 'approved', true, 3),
  ('Layla R.', 'موثوق كل مرة. أستخدم المتجر لشراء RP في لول أسبوعياً.', 5, 'approved', true, 4),
  ('Youssef K.', 'Fast delivery and fair prices. PUBG UC arrived in under a minute.', 5, 'approved', true, 5),
  ('Nour T.', 'Clean checkout, clear prices, and instant top-ups. Highly recommend.', 5, 'approved', true, 6),
  ('Rami S.', 'اشتريت بطاقة Xbox ووصل الكود فوراً. تجربة ممتازة من البداية للنهاية.', 5, 'approved', true, 7),
  ('Maya L.', 'Great support when I had a question about my order. Will buy again.', 5, 'approved', true, 8);