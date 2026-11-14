-- REVERT for 20261114100000_notification_wording.sql
-- Run manually (SQL editor) only if the new notification texts broke something.
-- Restores the exact pre-change bodies (grants were never changed) from echocore_backup.function_snapshots
-- (label '2026-11-14-notification-wording') and drops the helpers the migration added.
-- Notifications already written keep their (richer) metadata; the site shows them either way.

BEGIN;

DO $$
DECLARE
  s record;
  n int := 0;
BEGIN
  FOR s IN
    SELECT DISTINCT ON (proname, args) proname, args, definition, authenticated_exec, anon_exec
    FROM echocore_backup.function_snapshots
    WHERE label = '2026-11-14-notification-wording'
    ORDER BY proname, args, taken_at
  LOOP
    -- The migration changed no grants on these, and CREATE OR REPLACE keeps them.
    EXECUTE s.definition;
    n := n + 1;
  END LOOP;
  IF n <> 6 THEN
    RAISE EXCEPTION 'Expected 6 snapshots for 2026-11-14-notification-wording, found %', n;
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.telegram_alert_text(text, jsonb, text);
DROP FUNCTION IF EXISTS public.notif_method_label(text, text);
DROP FUNCTION IF EXISTS public.notif_ltr(text);
DROP FUNCTION IF EXISTS public.notif_money(text);

COMMIT;
