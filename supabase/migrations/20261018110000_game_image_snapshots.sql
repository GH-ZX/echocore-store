-- Game image snapshots (2026-10-18)
--
-- Backup + one-call restore for game cover/logo changes, used by the wide
-- 16:10 cover refresh (public/game-covers/*.webp, applied by
-- supabase/data/20261018_wide_game_covers_apply.sql).
--
-- Undo the refresh:  select public.admin_restore_game_images('2026-10-18-before-wide-covers');
-- (as an admin from the SQL editor / RPC, or run supabase/data/20261018_wide_game_covers_revert.sql)

CREATE SCHEMA IF NOT EXISTS echocore_backup;
REVOKE ALL ON SCHEMA echocore_backup FROM public, anon, authenticated;

CREATE TABLE IF NOT EXISTS echocore_backup.game_image_snapshots (
  id bigserial PRIMARY KEY,
  label text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now(),
  game_id uuid NOT NULL,
  image_url text,
  logo_url text,
  image_custom boolean,
  logo_custom boolean
);
CREATE INDEX IF NOT EXISTS game_image_snapshots_label_idx
  ON echocore_backup.game_image_snapshots (label);

CREATE OR REPLACE FUNCTION public.admin_restore_game_images(p_label text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, echocore_backup
AS $$
DECLARE
  v_n integer;
BEGIN
  -- Admin session, or SQL editor / service role (no JWT).
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  UPDATE public.games g
  SET image_url = s.image_url,
      logo_url = s.logo_url,
      image_custom = s.image_custom,
      logo_custom = s.logo_custom
  FROM (
    SELECT DISTINCT ON (game_id) game_id, image_url, logo_url, image_custom, logo_custom
    FROM echocore_backup.game_image_snapshots
    WHERE label = p_label
    ORDER BY game_id, taken_at
  ) s
  WHERE g.id = s.game_id;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.admin_restore_game_images(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.admin_restore_game_images(text) TO authenticated, service_role;

-- Baseline: every game's current images, before the wide-cover refresh.
INSERT INTO echocore_backup.game_image_snapshots (label, game_id, image_url, logo_url, image_custom, logo_custom)
SELECT '2026-10-18-before-wide-covers', id, image_url, logo_url, image_custom, logo_custom
FROM public.games
WHERE NOT EXISTS (
  SELECT 1 FROM echocore_backup.game_image_snapshots WHERE label = '2026-10-18-before-wide-covers'
);
