-- Point contact-form admin notifications to /dashboard/contact and include message preview.
-- Run: supabase db query --linked -f scripts/contact-notify-link-migration.sql

CREATE OR REPLACE FUNCTION public.on_contact_message_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  PERFORM public.notify_all_admins(
    'admin_contact_message',
    jsonb_build_object(
      'messageId', NEW.id,
      'name', NEW.name,
      'email', NEW.email,
      'message', left(coalesce(NEW.message, ''), 200)
    ),
    '/dashboard/contact'
  );
  RETURN NEW;
END;
$$;
