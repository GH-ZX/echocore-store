-- Move the games section to sit directly after carousel in saved home_layout.
UPDATE public.store_settings
SET home_layout = (
  SELECT COALESCE(jsonb_agg(elem ORDER BY sort_key), '[]'::jsonb)
  FROM (
    SELECT
      elem,
      CASE
        WHEN elem->>'type' = 'carousel' THEN 0
        WHEN elem->>'type' = 'games' THEN 1
        ELSE 100 + row_number() OVER (
          ORDER BY
            CASE WHEN elem->>'type' = 'carousel' THEN 0
                 WHEN elem->>'type' = 'games' THEN 1
                 ELSE 2 END,
            ord
        )
      END AS sort_key
    FROM public.store_settings s,
         jsonb_array_elements(COALESCE(s.home_layout, '[]'::jsonb)) WITH ORDINALITY AS t(elem, ord)
    WHERE s.id = 1
  ) ordered
),
updated_at = now()
WHERE id = 1;