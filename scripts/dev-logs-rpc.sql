-- Dev logs RPC — admin technical events (API, webhooks, client errors)
-- Apply: supabase db query --linked -f scripts/dev-logs-rpc.sql
-- Requires: scripts/site-logs-migration.sql

CREATE OR REPLACE FUNCTION public.log_dev_event(
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_severity text := COALESCE(nullif(trim(p_severity), ''), 'info');
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  IF NOT public.is_admin() THEN
    RETURN;
  END IF;

  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RETURN;
  END IF;

  IF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  PERFORM public.append_site_log(
    'dev',
    trim(p_event_type),
    v_severity,
    auth.uid(),
    NULL,
    COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_dev_event(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_dev_event(text, text, jsonb) TO authenticated;