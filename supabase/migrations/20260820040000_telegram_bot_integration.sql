-- Telegram bot integration: user linking, webhook secret, link/unlink RPCs
-- Pairs with supabase/functions/telegram-bot/index.ts

-- =============================================================================
-- 1. Schema additions
-- =============================================================================

-- Profiles: link a Telegram chat to a store account
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS telegram_chat_id text,
  ADD COLUMN IF NOT EXISTS telegram_linked_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_telegram_chat_id_unique
  ON public.profiles (telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id <> '';

COMMENT ON COLUMN public.profiles.telegram_chat_id IS 'Telegram chat ID linked to this user account (for bot delivery notifications).';
COMMENT ON COLUMN public.profiles.telegram_linked_at IS 'When the user linked their Telegram account.';

-- Store settings: webhook verification secret for incoming Telegram updates
ALTER TABLE public.store_settings
  ADD COLUMN IF NOT EXISTS telegram_webhook_secret text;

COMMENT ON COLUMN public.store_settings.telegram_webhook_secret IS 'Secret token validated on incoming Telegram webhook (x-telegram-bot-secret header).';

-- =============================================================================
-- 2. Link / unlink RPCs (customer-facing, auth.uid required)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.link_telegram_account(p_username text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_chat_id text;
  v_target public.profiles%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- The chat_id comes from the bot's caller context, stored via set_config
  -- by the edge function before calling this RPC.  Fallback: the edge
  -- function does the linking directly; this RPC is for future REST use.
  v_chat_id := nullif(current_setting('echocore.telegram_chat_id', true), '');

  IF v_chat_id IS NULL OR v_chat_id = '' THEN
    RAISE EXCEPTION 'Telegram chat ID not provided. Use the bot /link command instead.';
  END IF;

  -- Find target user by username
  SELECT * INTO v_target
  FROM public.profiles
  WHERE lower(username) = lower(trim(p_username));

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No account found with that username';
  END IF;

  -- Check if this chat is already linked to someone else
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE telegram_chat_id = v_chat_id
      AND id <> v_target.id
  ) THEN
    RAISE EXCEPTION 'This Telegram account is already linked to another user';
  END IF;

  UPDATE public.profiles
  SET telegram_chat_id = v_chat_id,
      telegram_linked_at = now()
  WHERE id = v_target.id;

  RETURN jsonb_build_object(
    'ok', true,
    'username', v_target.username,
    'linkedAt', now()
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.link_telegram_account(text) FROM public;
GRANT EXECUTE ON FUNCTION public.link_telegram_account(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.unlink_telegram_account()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  UPDATE public.profiles
  SET telegram_chat_id = NULL,
      telegram_linked_at = NULL
  WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'unlinked', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.unlink_telegram_account() FROM public;
GRANT EXECUTE ON FUNCTION public.unlink_telegram_account() TO authenticated;

-- =============================================================================
-- 3. Admin RPC: get Telegram bot info (for admin settings UI)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_telegram_bot_info()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_row public.store_settings%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_row FROM public.store_settings WHERE id = 1;

  RETURN jsonb_build_object(
    'telegram_bot_token_set', nullif(trim(v_row.telegram_bot_token), '') IS NOT NULL,
    'telegram_bot_username', v_row.telegram_bot_username,
    'telegram_chat_id', v_row.telegram_chat_id,
    'telegram_webhook_secret_set', nullif(trim(v_row.telegram_webhook_secret), '') IS NOT NULL,
    'telegram_alerts_enabled', COALESCE(v_row.telegram_alerts_enabled, false),
    'linked_users_count', (
      SELECT COUNT(*)::int FROM public.profiles
      WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id <> ''
        AND role = 'user'
    ),
    'linked_admins_count', (
      SELECT COUNT(*)::int FROM public.profiles
      WHERE telegram_chat_id IS NOT NULL AND telegram_chat_id <> ''
        AND role = 'admin'
    )
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_telegram_bot_info() FROM public;
GRANT EXECUTE ON FUNCTION public.get_telegram_bot_info() TO authenticated;

-- =============================================================================
-- 4. RLS: profiles — allow service_role to update telegram_chat_id
-- =============================================================================
-- The edge function uses service_role, so RLS is bypassed.
-- But for the REST RPCs (link/unlink), the user's own row is already writable
-- via the existing "Users update own profile" policy.  The trigger
-- protect_profile_sensitive_fields blocks balance/role changes but allows
-- other columns — telegram_chat_id is not in the frozen list, so it passes.

-- =============================================================================
-- 5. Wire Telegram notifications to linked users on fulfillment
-- =============================================================================
-- When an order is fulfilled or fails, also DM the customer via Telegram
-- if they have a linked chat.  This is a trigger on orders that fires
-- after the edge function writes fulfillment_status.

CREATE OR REPLACE FUNCTION public.notify_linked_user_telegram()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_chat_id text;
  v_token text;
  v_text text;
  v_url text;
  v_order_ref text;
  v_error text;
BEGIN
  -- Only fire on fulfillment_status changes
  IF OLD.fulfillment_status IS NOT DISTINCT FROM NEW.fulfillment_status THEN
    RETURN NEW;
  END IF;

  -- Skip if no user
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get linked Telegram chat
  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id
    AND telegram_chat_id IS NOT NULL
    AND telegram_chat_id <> '';

  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get bot token
  SELECT telegram_bot_token INTO v_token
  FROM public.store_settings
  WHERE id = 1
    AND telegram_alerts_enabled = true;

  IF v_token IS NULL OR trim(v_token) = '' THEN
    RETURN NEW;
  END IF;

  v_order_ref := COALESCE(NEW.order_ref, LEFT(NEW.id::text, 8));
  v_error := NEW.g2bulk_metadata->>'last_error';

  -- Build message
  IF NEW.fulfillment_status = 'fulfilled' THEN
    v_text := '🎉 <b>Order Delivered!</b>' || E'\n'
      || 'Order: <b>' || v_order_ref || '</b>' || E'\n'
      || 'Amount: <b>$' || NEW.total::text || '</b>' || E'\n\n'
      || 'View your invoice:';
  ELSIF NEW.fulfillment_status = 'failed' THEN
    v_text := '❌ <b>Order Failed</b>' || E'\n'
      || 'Order: <b>' || v_order_ref || '</b>' || E'\n'
      || 'Amount: <b>$' || NEW.total::text || '</b>';
    IF v_error IS NOT NULL THEN
      v_text := v_text || E'\nError: ' || v_error;
    END IF;
    IF (NEW.g2bulk_metadata->>'balance_refunded')::boolean = true THEN
      v_text := v_text || E'\n\n💰 Your balance has been refunded.';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Send via Telegram API
  BEGIN
    v_url := 'https://api.telegram.org/bot' || trim(v_token) || '/sendMessage';

    DECLARE
      v_buttons jsonb;
    BEGIN
      IF NEW.fulfillment_status = 'fulfilled' THEN
        v_buttons := jsonb_build_object(
          'inline_keyboard', jsonb_build_array(
            jsonb_build_array(
              jsonb_build_object('text', '📄 View Invoice', 'url', 'https://www.echocore412.com/invoice/order/' || NEW.id::text)
            )
          )
        );
      ELSIF NEW.fulfillment_status = 'failed' AND (NEW.g2bulk_metadata->>'balance_refunded')::boolean = true THEN
        v_buttons := jsonb_build_object(
          'inline_keyboard', jsonb_build_array(
            jsonb_build_array(
              jsonb_build_object('text', '💰 Recharge', 'url', 'https://www.echocore412.com/recharge')
            )
          )
        );
      ELSE
        v_buttons := NULL;
      END IF;

      PERFORM net.http_post(
        url := v_url,
        headers := jsonb_build_object('Content-Type', 'application/json'),
        body := jsonb_build_object(
          'chat_id', v_chat_id,
          'text', left(v_text, 3900),
          'parse_mode', 'HTML'
        ) || COALESCE(v_buttons, '{}'::jsonb),
        timeout_milliseconds := 10000
      );
    END;

    PERFORM public.try_append_site_log(
      'telegram', 'customer_fulfillment_' || NEW.fulfillment_status, 'info',
      NEW.user_id, NULL,
      jsonb_build_object('orderId', NEW.id, 'orderRef', v_order_ref, 'chatId', v_chat_id)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL; -- Never block the order update
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS notify_linked_user_telegram_on_fulfillment ON public.orders;
CREATE TRIGGER notify_linked_user_telegram_on_fulfillment
  AFTER UPDATE OF fulfillment_status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_linked_user_telegram();
