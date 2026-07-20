-- Site logs: wallet ledger events + client critical errors + severity filter
-- Apply: supabase db query --linked -f scripts/site-logs-wallet-errors-migration.sql
-- Requires: scripts/site-logs-migration.sql (append_site_log, site_logs table)

-- 1) Normalize severity on append (error → danger)
CREATE OR REPLACE FUNCTION public.append_site_log(
  p_category text,
  p_event_type text,
  p_severity text DEFAULT 'info',
  p_actor_user_id uuid DEFAULT NULL,
  p_subject_user_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_severity text := lower(trim(COALESCE(p_severity, 'info')));
BEGIN
  IF p_category IS NULL OR length(trim(p_category)) = 0 THEN
    RETURN NULL;
  END IF;
  IF p_event_type IS NULL OR length(trim(p_event_type)) = 0 THEN
    RETURN NULL;
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity IN ('warn') THEN
    v_severity := 'warning';
  ELSIF v_severity IN ('ok', 'ok ') THEN
    v_severity := 'success';
  ELSIF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  INSERT INTO public.site_logs (
    category,
    event_type,
    severity,
    actor_user_id,
    subject_user_id,
    metadata
  )
  VALUES (
    trim(p_category),
    trim(p_event_type),
    v_severity,
    p_actor_user_id,
    p_subject_user_id,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.append_site_log(text, text, text, uuid, uuid, jsonb) FROM public;

-- 2) Wallet movement log on every transactions row
CREATE OR REPLACE FUNCTION public.log_wallet_transaction_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_user_name text;
  v_severity text := 'info';
  v_event text;
  v_amount numeric;
BEGIN
  v_event := lower(trim(COALESCE(NEW.type, 'movement')));
  v_amount := COALESCE(NEW.amount, 0);

  IF v_event = 'recharge' OR (v_event = 'adjustment' AND v_amount > 0) THEN
    v_severity := 'success';
  ELSIF v_event = 'purchase' THEN
    v_severity := 'info';
  ELSIF v_event = 'refund' THEN
    v_severity := 'warning';
  ELSIF v_event = 'adjustment' AND v_amount < 0 THEN
    v_severity := 'warning';
  ELSE
    v_severity := 'info';
  END IF;

  SELECT nullif(trim(COALESCE(p.name, p.username, '')), '')
  INTO v_user_name
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  PERFORM public.append_site_log(
    'wallet',
    v_event,
    v_severity,
    NEW.user_id,
    NEW.user_id,
    jsonb_build_object(
      'transactionId', NEW.id,
      'amount', NEW.amount,
      'balanceAfter', NEW.balance_after,
      'paymentMethod', NEW.payment_method,
      'reference', NEW.reference,
      'status', NEW.status,
      'userName', COALESCE(v_user_name, ''),
      'type', NEW.type
    )
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never block wallet writes because of logging
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS transactions_log_wallet ON public.transactions;
CREATE TRIGGER transactions_log_wallet
  AFTER INSERT ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.log_wallet_transaction_event();

REVOKE EXECUTE ON FUNCTION public.log_wallet_transaction_event() FROM public;

-- 3) Client / storefront critical errors (any authenticated user; rate-limited)
CREATE OR REPLACE FUNCTION public.log_client_error(
  p_event_type text,
  p_severity text DEFAULT 'danger',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_severity text := lower(trim(COALESCE(p_severity, 'danger')));
  v_event text := left(trim(COALESCE(p_event_type, 'client_error')), 80);
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_recent int := 0;
BEGIN
  IF v_event = '' THEN
    v_event := 'client_error';
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  END IF;

  -- Only warning / danger (no spam info from clients)
  IF v_severity NOT IN ('warning', 'danger') THEN
    v_severity := 'danger';
  END IF;

  -- Rate limit: 12 per user (or anon fingerprint) per minute
  IF v_uid IS NOT NULL THEN
    SELECT count(*)::int INTO v_recent
    FROM public.site_logs
    WHERE category = 'error'
      AND actor_user_id = v_uid
      AND created_at > now() - interval '1 minute';
  ELSE
    SELECT count(*)::int INTO v_recent
    FROM public.site_logs
    WHERE category = 'error'
      AND actor_user_id IS NULL
      AND created_at > now() - interval '1 minute'
      AND metadata->>'sessionKey' IS NOT DISTINCT FROM (v_meta->>'sessionKey');
  END IF;

  IF v_recent >= 12 THEN
    RETURN;
  END IF;

  -- Cap huge console dumps
  IF v_meta ? 'consoleLog' AND length(v_meta->>'consoleLog') > 12000 THEN
    v_meta := v_meta || jsonb_build_object(
      'consoleLog', left(v_meta->>'consoleLog', 12000) || E'\n…[truncated]'
    );
  END IF;
  IF v_meta ? 'stack' AND length(v_meta->>'stack') > 8000 THEN
    v_meta := v_meta || jsonb_build_object(
      'stack', left(v_meta->>'stack', 8000) || E'\n…[truncated]'
    );
  END IF;

  IF v_uid IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_uid) THEN
    v_uid := NULL;
  END IF;

  PERFORM public.append_site_log(
    'error',
    v_event,
    v_severity,
    v_uid,
    v_uid,
    v_meta
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_client_error(text, text, jsonb) TO anon, authenticated;

-- 4) Admin fetch: category + optional severity bucket (critical = warn/danger)
CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL,
  p_severity text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  v_category text := nullif(trim(p_category), '');
  v_severity text := lower(nullif(trim(p_severity), ''));
  v_total bigint;
  v_logs jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'critical';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.site_logs sl
  WHERE (v_category IS NULL OR sl.category = v_category)
    AND (
      v_severity IS NULL
      OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger', 'error'))
      OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
    );

  SELECT COALESCE(jsonb_agg(row_to_json(q)::jsonb ORDER BY q.created_at DESC), '[]'::jsonb)
  INTO v_logs
  FROM (
    SELECT
      sl.id,
      sl.category,
      sl.event_type,
      CASE
        WHEN sl.severity IN ('error', 'err') THEN 'danger'
        ELSE sl.severity
      END AS severity,
      sl.actor_user_id,
      sl.subject_user_id,
      sl.metadata,
      sl.created_at,
      COALESCE(ap.name, ap.username, au.email, '') AS actor_name,
      COALESCE(sp.name, sp.username, su.email, '') AS subject_name
    FROM public.site_logs sl
    LEFT JOIN public.profiles ap ON ap.id = sl.actor_user_id
    LEFT JOIN auth.users au ON au.id = sl.actor_user_id
    LEFT JOIN public.profiles sp ON sp.id = sl.subject_user_id
    LEFT JOIN auth.users su ON su.id = sl.subject_user_id
    WHERE (v_category IS NULL OR sl.category = v_category)
      AND (
        v_severity IS NULL
        OR (v_severity = 'critical' AND sl.severity IN ('warning', 'danger', 'error'))
        OR (v_severity IS DISTINCT FROM 'critical' AND sl.severity = v_severity)
      )
    ORDER BY sl.created_at DESC
    LIMIT v_limit
    OFFSET v_offset
  ) q;

  RETURN jsonb_build_object(
    'logs', v_logs,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text, text) TO authenticated;

-- Keep 3-arg overload for older clients
CREATE OR REPLACE FUNCTION public.get_admin_site_logs(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN public.get_admin_site_logs(p_limit, p_offset, p_category, NULL);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_admin_site_logs(int, int, text) TO authenticated;

-- 5) Admin-only dev events: allow larger console payloads (already admin-gated)
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
  v_severity text := lower(trim(COALESCE(p_severity, 'info')));
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
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

  IF v_severity IN ('error', 'err', 'critical', 'fatal') THEN
    v_severity := 'danger';
  ELSIF v_severity = 'warn' THEN
    v_severity := 'warning';
  ELSIF v_severity NOT IN ('info', 'success', 'warning', 'danger') THEN
    v_severity := 'info';
  END IF;

  IF v_meta ? 'consoleLog' AND length(v_meta->>'consoleLog') > 12000 THEN
    v_meta := v_meta || jsonb_build_object(
      'consoleLog', left(v_meta->>'consoleLog', 12000) || E'\n…[truncated]'
    );
  END IF;

  PERFORM public.append_site_log(
    'dev',
    trim(p_event_type),
    v_severity,
    auth.uid(),
    NULL,
    v_meta
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_dev_event(text, text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.log_dev_event(text, text, jsonb) TO authenticated;
