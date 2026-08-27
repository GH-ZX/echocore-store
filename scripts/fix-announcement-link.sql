-- Fix existing broadcast notifications: set link to null
-- so the new /announcements page routing works correctly.
-- External links (e.g. Telegram channel) will show as a button in the notification row.
--
-- Run this in: Supabase Dashboard → SQL Editor

-- 1. Preview what will be changed
SELECT id, type, link, metadata, created_at
FROM public.notifications
WHERE type IN ('admin_announcement', 'admin_warning', 'admin_maintenance_notice')
  AND link IS NOT NULL;

-- 2. Set link to null for all broadcast notifications
UPDATE public.notifications
SET link = NULL
WHERE type IN ('admin_announcement', 'admin_warning', 'admin_maintenance_notice')
  AND link IS NOT NULL;
