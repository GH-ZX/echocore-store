-- Fix existing broadcast notifications: null out the link field
-- so the /announcements page routing works correctly.
-- External links (e.g. Telegram channel) now show as a button in the notification row.

UPDATE public.notifications
SET link = NULL
WHERE type IN ('admin_announcement', 'admin_warning', 'admin_maintenance_notice')
  AND link IS NOT NULL;
