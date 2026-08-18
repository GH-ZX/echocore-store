-- =============================================================================
-- RECENT PURCHASE ACTIVITY RPC (2026-08-18)
-- Powers the anonymized "latest top-ups" ticker on the home page.
-- Returns ONLY game name + minutes-ago for recently fulfilled orders — no
-- usernames, emails, or amounts — so it is safe to grant to anon/authenticated.
-- Mirrors the merged copy in supabase_echocore_full.sql (§31b).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.list_recent_purchase_activity(p_limit int DEFAULT 6)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE AS $$
  SELECT COALESCE(jsonb_agg(t.row_data ORDER BY t.row_data->>'created_at' DESC), '[]'::jsonb)
  FROM (
    SELECT jsonb_build_object(
      'game_name_ar', COALESCE(g.name_ar, g.name_en),
      'game_name_en', g.name_en,
      'minutes_ago', GREATEST(1, floor(EXTRACT(EPOCH FROM (now() - o.created_at)) / 60))::int,
      'created_at', o.created_at
    ) AS row_data
    FROM public.orders o
    JOIN public.order_items oi ON oi.order_id = o.id
    JOIN public.offers f ON f.id = oi.offer_id
    JOIN public.games g ON g.id = f.game_id
    WHERE o.status = 'completed'
      AND (o.fulfillment_status IS NULL OR o.fulfillment_status = 'fulfilled')
      AND o.created_at > now() - interval '48 hours'
      AND g.id IS NOT NULL
    GROUP BY o.id, g.name_ar, g.name_en, o.created_at
    ORDER BY o.created_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 6), 20))
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.list_recent_purchase_activity(int) FROM public;
GRANT EXECUTE ON FUNCTION public.list_recent_purchase_activity(int) TO anon, authenticated;
