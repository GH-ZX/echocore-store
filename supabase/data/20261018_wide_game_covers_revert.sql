-- Wide 16:10 game covers (2026-10-18) — REVERT
-- Puts every game's image_url / logo_url / *_custom back to the snapshot taken
-- before the refresh. Also revert the frontend commit if you want the files gone.

SELECT public.admin_restore_game_images('2026-10-18-before-wide-covers');
