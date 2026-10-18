-- Telegram admin alerts to several chats (2026-10-18)
--
-- store_settings.telegram_chat_id may now hold several chat ids separated by
-- commas / spaces / new lines, e.g. '6392329080, 123456789'. Every admin alert
-- goes to each of them. A single id keeps working exactly as before.
-- Revert: previous definition is in echocore_backup.function_snapshots
--   (label '2026-10-18-security-lockdown', proname 'notify_admin_telegram').

CREATE OR REPLACE FUNCTION public.telegram_admin_chat_ids(p_raw text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(array_agg(DISTINCT id), '{}')
  FROM unnest(regexp_split_to_array(COALESCE(p_raw, ''), '[\s,;]+')) AS id
  WHERE id ~ '^-?[0-9]+$';
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_admin_chat_ids(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_admin_chat_ids(text) TO service_role;

CREATE OR REPLACE FUNCTION public.notify_admin_telegram(p_type text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_row public.store_settings%ROWTYPE;
  v_chats text[];
  v_chat text;
  v_token text;
  v_text text;
  v_link text;
  v_meta jsonb := COALESCE(p_metadata, '{}'::jsonb);
  v_order_id uuid;
  v_body jsonb;
BEGIN
  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  IF NOT COALESCE(v_row.telegram_alerts_enabled, false) THEN
    RETURN;
  END IF;

  v_token := nullif(trim(COALESCE(v_row.telegram_bot_token, '')), '');
  v_chats := public.telegram_admin_chat_ids(v_row.telegram_chat_id);
  IF v_token IS NULL OR cardinality(v_chats) = 0 THEN
    RETURN;
  END IF;

  IF COALESCE((v_row.telegram_alert_prefs->>p_type)::boolean, true) = false THEN
    RETURN;
  END IF;

  IF p_type IN ('orderPaid', 'fulfillmentFail') AND (v_meta->>'orderId') ~* '^[0-9a-f-]{36}$' THEN
    v_order_id := (v_meta->>'orderId')::uuid;
    v_meta := v_meta || jsonb_build_object('items', public.telegram_order_items_text(v_order_id));
  END IF;

  v_text := public.telegram_alert_message(p_type, v_meta);
  IF v_text IS NULL OR v_text = '' THEN
    RETURN;
  END IF;

  v_link := public.telegram_alert_link(p_type, v_meta);

  FOREACH v_chat IN ARRAY v_chats LOOP
    BEGIN
      v_body := jsonb_build_object(
        'chat_id', v_chat,
        'text', left(v_text, 3500),
        'parse_mode', 'HTML',
        'disable_web_page_preview', true
      );
      IF v_link IS NOT NULL THEN
        v_body := v_body || jsonb_build_object(
          'reply_markup', jsonb_build_object(
            'inline_keyboard', jsonb_build_array(jsonb_build_array(
              jsonb_build_object('text', '🔎 Open in dashboard', 'url', v_link)
            ))
          )
        );
      END IF;

      PERFORM net.http_post(
        url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := v_body,
        timeout_milliseconds := 30000
      );
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  BEGIN
    PERFORM public.try_append_site_log(
      'telegram', p_type, 'info', NULL, NULL,
      jsonb_build_object('length', length(v_text), 'chats', cardinality(v_chats))
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END;
$function$;
