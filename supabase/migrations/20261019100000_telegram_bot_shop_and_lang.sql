-- Telegram bot: language switcher + buying with wallet balance (2026-10-19)
--
-- telegram_chats: per-chat language and the in-progress purchase (flow).
--   Service-role only (RLS on, no policies).
-- telegram_quote_offer / telegram_create_order: service-role only. The order
--   function runs the website's own checkout (create_order_atomic) as the
--   linked customer, so every server-side rule applies unchanged: price check,
--   never below supplier cost, balance lock, idempotency, ban check.
-- notify_linked_user_telegram: Arabic text when the chat chose Arabic.

CREATE TABLE IF NOT EXISTS public.telegram_chats (
  chat_id text PRIMARY KEY,
  lang text NOT NULL DEFAULT 'ar' CHECK (lang IN ('ar', 'en')),
  flow jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_chats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.telegram_chats FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.telegram_chats TO service_role;

-- Customer unit price for one offer (partner tier aware, same as checkout).
CREATE OR REPLACE FUNCTION public.telegram_quote_offer(p_user_id uuid, p_offer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offer record;
  v_partner numeric;
  v_price numeric;
BEGIN
  SELECT o.id, o.price, o.g2bulk_cost_usd, COALESCE(o.active, true) AS active,
         o.name_en, o.name_ar, o.g2bulk_type, g.id AS game_id, g.name_en AS game_en,
         g.name_ar AS game_ar, COALESCE(g.active, true) AS game_active, g.redemption_method
  INTO v_offer
  FROM public.offers o JOIN public.games g ON g.id = o.game_id
  WHERE o.id = p_offer_id;
  IF v_offer.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT t.markup_percent INTO v_partner
  FROM public.profiles p
  JOIN public.partner_tiers t ON t.id = p.partner_tier_id AND t.is_active = true
  WHERE p.id = p_user_id;

  v_price := v_offer.price;
  IF v_partner IS NOT NULL AND v_offer.g2bulk_cost_usd IS NOT NULL AND v_offer.g2bulk_cost_usd > 0 THEN
    v_price := LEAST(v_offer.price, COALESCE(public.partner_price_from_cost(v_offer.g2bulk_cost_usd, v_partner), v_offer.price));
  END IF;

  RETURN jsonb_build_object(
    'ok', v_offer.active AND v_offer.game_active,
    'reason', CASE WHEN v_offer.active AND v_offer.game_active THEN NULL ELSE 'inactive' END,
    'price', v_price,
    'offer_en', v_offer.name_en, 'offer_ar', v_offer.name_ar,
    'game_en', v_offer.game_en, 'game_ar', v_offer.game_ar,
    'game_id', v_offer.game_id,
    'is_voucher', v_offer.redemption_method = 'redeem_code' OR v_offer.g2bulk_type = 'voucher'
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_quote_offer(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_quote_offer(uuid, uuid) TO service_role;

-- Place a wallet-balance order for the linked customer through the normal checkout.
CREATE OR REPLACE FUNCTION public.telegram_create_order(
  p_user_id uuid,
  p_offer_id uuid,
  p_player_uid text,
  p_player_server text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote jsonb;
  v_price numeric;
  v_name text;
  v_uid text := nullif(trim(COALESCE(p_player_uid, '')), '');
  v_server text := nullif(trim(COALESCE(p_player_server, '')), '');
BEGIN
  IF p_user_id IS NULL OR coalesce(trim(p_idempotency_key), '') = '' THEN
    RAISE EXCEPTION 'Missing user or idempotency key';
  END IF;

  v_quote := public.telegram_quote_offer(p_user_id, p_offer_id);
  IF NOT COALESCE((v_quote->>'ok')::boolean, false) THEN
    RAISE EXCEPTION 'Offer unavailable';
  END IF;
  IF NOT COALESCE((v_quote->>'is_voucher')::boolean, false) AND v_uid IS NULL THEN
    RAISE EXCEPTION 'Player ID is required';
  END IF;

  IF v_uid IS NOT NULL AND public.has_open_duplicate_topup(p_user_id, p_offer_id, v_uid, 10) THEN
    RAISE EXCEPTION 'A top-up for this player is already in progress';
  END IF;

  v_price := (v_quote->>'price')::numeric;
  v_name := COALESCE(v_quote->>'game_en', '') || ' — ' || COALESCE(v_quote->>'offer_en', '');

  -- Act as the customer for the shared checkout (auth.uid() = p_user_id).
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', p_user_id::text, true);

  RETURN public.create_order_atomic(
    p_user_id,
    v_price,
    'balance',
    jsonb_build_array(jsonb_build_object(
      'offer_id', p_offer_id,
      'name_snapshot', v_name,
      'price', v_price,
      'quantity', 1,
      'player_uid', v_uid,
      'player_server', v_server
    )),
    v_uid,
    v_server,
    'tg-' || p_idempotency_key,
    NULL
  );
END;
$$;
REVOKE EXECUTE ON FUNCTION public.telegram_create_order(uuid, uuid, text, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.telegram_create_order(uuid, uuid, text, text, text) TO service_role;

-- Delivered / failed notification in the chat's language.
CREATE OR REPLACE FUNCTION public.notify_linked_user_telegram()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_chat_id text;
  v_token text;
  v_text text;
  v_order_ref text;
  v_items text;
  v_buttons jsonb;
  v_refunded boolean;
  v_ar boolean;
BEGIN
  IF OLD.fulfillment_status IS NOT DISTINCT FROM NEW.fulfillment_status THEN
    RETURN NEW;
  END IF;
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.fulfillment_status NOT IN ('fulfilled', 'failed') THEN
    RETURN NEW;
  END IF;

  SELECT telegram_chat_id INTO v_chat_id
  FROM public.profiles
  WHERE id = NEW.user_id AND telegram_chat_id IS NOT NULL AND telegram_chat_id <> '';
  IF v_chat_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT nullif(trim(telegram_bot_token), '') INTO v_token
  FROM public.store_settings WHERE id = 1;
  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  v_ar := COALESCE((SELECT lang = 'ar' FROM public.telegram_chats WHERE chat_id = v_chat_id), true);
  v_order_ref := COALESCE(NEW.order_ref, LEFT(NEW.id::text, 8));
  v_items := public.telegram_order_items_text(NEW.id);
  v_refunded := COALESCE((NEW.g2bulk_metadata->>'balance_refunded')::boolean, false);

  IF NEW.fulfillment_status = 'fulfilled' THEN
    v_text := CASE WHEN v_ar THEN '🎉 <b>تم تسليم طلبك!</b>' ELSE '🎉 <b>Order delivered!</b>' END || E'\n'
      || CASE WHEN v_ar THEN 'الطلب: ' ELSE 'Order: ' END || '<code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || CASE WHEN v_ar THEN 'المبلغ: ' ELSE 'Amount: ' END || '<b>$' || NEW.total::text || '</b>';
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '📄 عرض الفاتورة' ELSE '📄 View invoice' END, 'url', 'https://www.echocore412.com/invoice/order/' || NEW.id::text)),
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '📦 طلباتي' ELSE '📦 My orders' END, 'callback_data', 'my_orders'))
    );
  ELSE
    v_text := CASE WHEN v_ar THEN '❌ <b>لم نتمكن من إتمام طلبك</b>' ELSE '❌ <b>We could not complete your order</b>' END || E'\n'
      || CASE WHEN v_ar THEN 'الطلب: ' ELSE 'Order: ' END || '<code>' || public.telegram_escape(v_order_ref) || '</code>' || E'\n'
      || COALESCE(nullif(v_items, '') || E'\n', '')
      || CASE WHEN v_ar THEN 'المبلغ: ' ELSE 'Amount: ' END || '<b>$' || NEW.total::text || '</b>';
    IF v_refunded THEN
      v_text := v_text || E'\n\n' || CASE WHEN v_ar THEN '💰 تم إرجاع المبلغ إلى رصيدك.' ELSE '💰 Your balance has been refunded.' END;
    ELSE
      v_text := v_text || E'\n\n' || CASE WHEN v_ar THEN 'فريقنا يتابع الطلب.' ELSE 'Our team is looking into it.' END;
    END IF;
    v_buttons := jsonb_build_array(
      jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '💬 تواصل مع الدعم' ELSE '💬 Contact support' END, 'url', 'https://www.echocore412.com/contact'))
    );
    IF v_refunded THEN
      v_buttons := jsonb_build_array(
        jsonb_build_array(jsonb_build_object('text', CASE WHEN v_ar THEN '🛒 تصفح المتجر' ELSE '🛒 Browse store' END, 'url', 'https://www.echocore412.com'))
      ) || v_buttons;
    END IF;
  END IF;

  BEGIN
    PERFORM net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'chat_id', v_chat_id,
        'text', left(v_text, 3500),
        'parse_mode', 'HTML',
        'disable_web_page_preview', true,
        'reply_markup', jsonb_build_object('inline_keyboard', v_buttons)
      ),
      timeout_milliseconds := 10000
    );
    PERFORM public.try_append_site_log(
      'telegram', 'customer_fulfillment_' || NEW.fulfillment_status, 'info',
      NEW.user_id, NULL,
      jsonb_build_object('orderId', NEW.id, 'orderRef', v_order_ref)
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;
END;
$function$;
