-- Official carousel covers (2026-11-17) — REVERT
-- Puts every game's image_url / logo_url / *_custom back to the snapshot taken
-- by the apply script. Focus points and points_name are not restored; revert the
-- frontend commit too if you want the old cover files back.

SELECT public.admin_restore_game_images('2026-11-17-before-official-covers');
