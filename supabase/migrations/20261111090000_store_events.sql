-- Store events (2026-11-11).
-- An event is a time-boxed campaign the owner runs from Dashboard → Events: a title and text, a
-- festive look layered over the site theme (the saved theme is never touched, so ending the event
-- reverts the look by itself), and optionally a lower profit margin for its duration.
--
-- Prices: starting an event with markup_percent set caps every pack's margin at that percent:
--   * the store markup (store_settings.g2bulk_markup_percent) drops to it; the old value is kept in
--     saved_markup_percent and restored when the event ends;
--   * packs with a custom margin above it follow it too (their own margin is parked in
--     offers.event_saved_margin, because the daily catalog sync reprices from that column);
--   * fixed-price packs are lowered to it when include_fixed is on.
-- offers.event_compare_price keeps each pack's price from before the event: the storefront shows it
-- struck through, and it is what fixed-price packs return to. Ending the event reprices everything
-- by the normal rules. start/end run in one transaction; a cron tick starts scheduled events and
-- ends expired ones.

-- 1. Events ------------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
  title_ar text NOT NULL CHECK (length(title_ar) BETWEEN 1 AND 120),
  title_en text NOT NULL CHECK (length(title_en) BETWEEN 1 AND 120),
  description_ar text CHECK (description_ar IS NULL OR length(description_ar) <= 1000),
  description_en text CHECK (description_en IS NULL OR length(description_en) <= 1000),
  note_ar text CHECK (note_ar IS NULL OR length(note_ar) <= 300),
  note_en text CHECK (note_en IS NULL OR length(note_en) <= 300),
  badge_ar text CHECK (badge_ar IS NULL OR length(badge_ar) <= 40),
  badge_en text CHECK (badge_en IS NULL OR length(badge_en) <= 40),
  look text NOT NULL DEFAULT 'celebration' CHECK (look ~ '^[a-z0-9-]{1,32}$'),
  theme jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(theme) = 'object'),
  options jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
  banner_image_url text CHECK (banner_image_url IS NULL OR length(banner_image_url) <= 1000),
  markup_percent numeric CHECK (markup_percent IS NULL OR (markup_percent >= 1 AND markup_percent <= 200)),
  include_fixed boolean NOT NULL DEFAULT true,
  starts_at timestamptz,
  ends_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'ended')),
  saved_markup_percent numeric,
  started_at timestamptz,
  ended_at timestamptz,
  price_summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT store_events_dates CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at),
  CONSTRAINT store_events_scheduled_needs_start CHECK (status <> 'scheduled' OR starts_at IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS store_events_one_active ON public.store_events ((true)) WHERE status = 'active';

ALTER TABLE public.store_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins manage events" ON public.store_events;
CREATE POLICY "Admins manage events" ON public.store_events FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Customers read events only through get_active_store_event() / list_public_store_events(),
-- which leave out the margin columns.
REVOKE ALL ON public.store_events FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_events TO authenticated;
GRANT ALL ON public.store_events TO service_role;

-- Status moves into and out of 'active' only through the start/end functions (they change prices).
CREATE OR REPLACE FUNCTION public.trg_store_events_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('echocore.event_transition', true) = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'active' THEN
      RAISE EXCEPTION 'event_running_end_first';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status NOT IN ('draft', 'scheduled') THEN
      RAISE EXCEPTION 'event_status_use_start';
    END IF;
    NEW.saved_markup_percent := NULL;
    NEW.started_at := NULL;
    NEW.ended_at := NULL;
    NEW.price_summary := NULL;
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status IN ('active', 'ended') OR OLD.status = 'active' THEN
      RAISE EXCEPTION 'event_status_use_start';
    END IF;
    IF OLD.status = 'ended' THEN -- an ended event can be reused as a new draft
      NEW.started_at := NULL;
      NEW.ended_at := NULL;
      NEW.price_summary := NULL;
    END IF;
  END IF;
  IF OLD.status = 'active' AND (
    NEW.markup_percent IS DISTINCT FROM OLD.markup_percent OR NEW.include_fixed IS DISTINCT FROM OLD.include_fixed
  ) THEN
    RAISE EXCEPTION 'event_running_prices_locked';
  END IF;
  NEW.saved_markup_percent := OLD.saved_markup_percent;
  IF NEW.status = OLD.status THEN
    NEW.started_at := OLD.started_at;
    NEW.ended_at := OLD.ended_at;
    NEW.price_summary := OLD.price_summary;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_store_events_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS store_events_guard ON public.store_events;
CREATE TRIGGER store_events_guard BEFORE INSERT OR UPDATE OR DELETE ON public.store_events
  FOR EACH ROW EXECUTE FUNCTION public.trg_store_events_guard();

-- 2. Packs: the price before the event, and a parked custom margin ---------------------------------
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS event_compare_price numeric,
  ADD COLUMN IF NOT EXISTS event_saved_margin numeric;
-- Column grants on offers are explicit (cost stays hidden): customers may read the old price only.
GRANT SELECT (event_compare_price) ON public.offers TO anon, authenticated;

CREATE OR REPLACE VIEW public.public_offers WITH (security_invoker = true) AS
SELECT id, game_id, name_en, name_ar, price, amount, region, description_en, description_ar, active,
       sale_image_url, is_sale, original_price, image_url, image_custom, sale_image_custom, created_at,
       g2bulk_type, g2bulk_catalogue_name, g2bulk_product_id, catalog_source, g2bulk_catalogue_id,
       g2bulk_synced_at, card_badge_en, card_badge_ar, instructions_en, instructions_ar,
       event_compare_price
FROM public.offers;
GRANT SELECT ON public.public_offers TO anon, authenticated;

-- 3. Pricing in SQL (mirrors applyMarkup in src/lib/offerPricing.js and the g2bulk function) -------
CREATE OR REPLACE FUNCTION public.store_price_from_cost(p_cost numeric, p_markup numeric, p_step numeric DEFAULT 0)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_cents numeric;
  v_step_cents numeric := 0;
BEGIN
  IF p_cost IS NULL OR p_cost <= 0 THEN
    RETURN NULL;
  END IF;
  -- cost × (100 + markup) is the price in cents, rounded up to a whole cent
  v_cents := ceil(round(p_cost * (100 + coalesce(p_markup, 0)), 6));
  IF coalesce(p_step, 0) IN (0.05, 0.1, 0.25, 0.5, 1) THEN
    v_step_cents := round(p_step * 100);
  END IF;
  IF v_step_cents > 0 THEN
    v_cents := ceil(v_cents / v_step_cents) * v_step_cents;
  END IF;
  RETURN round(v_cents / 100.0, 2);
END;
$$;
REVOKE ALL ON FUNCTION public.store_price_from_cost(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_price_from_cost(numeric, numeric, numeric) TO service_role;

-- 4. Start / end -------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_store_event_internal(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.store_events%ROWTYPE;
  v_store numeric;
  v_step numeric;
  v_cap numeric;
  v_saved numeric := NULL;
  v_lowered integer := 0;
  v_summary jsonb := NULL;
BEGIN
  SELECT * INTO v_event FROM public.store_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;
  IF v_event.status = 'active' THEN
    RETURN jsonb_build_object('ok', true, 'alreadyActive', true);
  END IF;
  IF v_event.status = 'ended' THEN
    RAISE EXCEPTION 'event_already_ended';
  END IF;
  IF EXISTS (SELECT 1 FROM public.store_events WHERE status = 'active') THEN
    RAISE EXCEPTION 'another_event_running';
  END IF;

  v_cap := v_event.markup_percent;
  IF v_cap IS NOT NULL THEN
    BEGIN
      PERFORM public.snapshot_offer_prices('event-start-' || v_event.slug || '-' || to_char(now(), 'YYYYMMDD-HH24MISS'));
    EXCEPTION WHEN OTHERS THEN
      NULL; -- the per-pack event_compare_price below is the copy the event itself relies on
    END;

    SELECT coalesce(g2bulk_markup_percent, 12), coalesce(g2bulk_price_round_step, 0)
    INTO v_store, v_step
    FROM public.store_settings WHERE id = 1;

    UPDATE public.offers SET event_compare_price = price, event_saved_margin = NULL;

    UPDATE public.offers
    SET event_saved_margin = pricing_margin_percent, pricing_margin_percent = v_cap
    WHERE pricing_mode = 'margin' AND pricing_margin_percent IS NOT NULL AND pricing_margin_percent > v_cap;

    IF v_store > v_cap THEN
      v_saved := v_store;
      UPDATE public.store_settings SET g2bulk_markup_percent = v_cap, updated_at = now() WHERE id = 1;
    END IF;

    UPDATE public.offers o
    SET price = CASE
      WHEN o.pricing_mode = 'fixed' THEN
        CASE WHEN v_event.include_fixed
          THEN least(o.price, public.store_price_from_cost(o.g2bulk_cost_usd, v_cap, v_step))
          ELSE o.price END
      WHEN o.pricing_mode = 'margin' THEN
        public.store_price_from_cost(o.g2bulk_cost_usd, coalesce(o.pricing_margin_percent, least(v_store, v_cap)), v_step)
      ELSE public.store_price_from_cost(o.g2bulk_cost_usd, least(v_store, v_cap), v_step)
    END
    WHERE o.g2bulk_cost_usd > 0 AND coalesce(o.is_sale, false) = false;

    -- keep the old price only where the pack really got cheaper
    UPDATE public.offers SET event_compare_price = NULL
    WHERE event_compare_price IS NOT NULL AND event_compare_price <= price;

    SELECT count(*) INTO v_lowered FROM public.offers WHERE event_compare_price IS NOT NULL;
    SELECT jsonb_build_object(
      'lowered', v_lowered,
      'activeLowered', count(*) FILTER (WHERE active),
      'avgPercentOff', round(avg((event_compare_price - price) / event_compare_price * 100) FILTER (WHERE active), 1),
      'maxPercentOff', round(max((event_compare_price - price) / event_compare_price * 100) FILTER (WHERE active), 1),
      'storeMarkupBefore', v_store,
      'eventMarkup', v_cap
    ) INTO v_summary
    FROM public.offers WHERE event_compare_price IS NOT NULL;
  END IF;

  PERFORM set_config('echocore.event_transition', '1', true);
  UPDATE public.store_events
  SET status = 'active',
      started_at = now(),
      ended_at = NULL,
      starts_at = CASE WHEN starts_at IS NULL OR starts_at > now() THEN now() ELSE starts_at END,
      ends_at = CASE WHEN ends_at IS NULL OR ends_at <= now() THEN now() + interval '7 days' ELSE ends_at END,
      saved_markup_percent = v_saved,
      price_summary = v_summary,
      updated_at = now()
  WHERE id = p_event_id;
  PERFORM set_config('echocore.event_transition', '', true);

  BEGIN
    PERFORM public.append_site_log('admin', 'event_started', 'info', auth.uid(), NULL,
      jsonb_build_object('eventId', v_event.id, 'slug', v_event.slug, 'markup', v_cap, 'summary', v_summary));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'eventId', v_event.id, 'summary', v_summary);
END;
$$;

CREATE OR REPLACE FUNCTION public.end_store_event_internal(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event public.store_events%ROWTYPE;
  v_store numeric;
  v_step numeric;
  v_restored integer := 0;
BEGIN
  SELECT * INTO v_event FROM public.store_events WHERE id = p_event_id FOR UPDATE;
  IF v_event.id IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;
  IF v_event.status <> 'active' THEN
    RAISE EXCEPTION 'event_not_running';
  END IF;

  IF v_event.markup_percent IS NOT NULL THEN
    BEGIN
      PERFORM public.snapshot_offer_prices('event-end-' || v_event.slug || '-' || to_char(now(), 'YYYYMMDD-HH24MISS'));
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;

    IF v_event.saved_markup_percent IS NOT NULL THEN
      UPDATE public.store_settings
      SET g2bulk_markup_percent = v_event.saved_markup_percent, updated_at = now()
      WHERE id = 1;
    END IF;

    UPDATE public.offers
    SET pricing_margin_percent = event_saved_margin, event_saved_margin = NULL
    WHERE event_saved_margin IS NOT NULL;

    SELECT coalesce(g2bulk_markup_percent, 12), coalesce(g2bulk_price_round_step, 0)
    INTO v_store, v_step
    FROM public.store_settings WHERE id = 1;

    UPDATE public.offers o
    SET price = CASE
      WHEN o.pricing_mode = 'fixed' THEN
        CASE
          WHEN o.event_compare_price IS NULL THEN o.price
          WHEN o.event_compare_price >= ceil(o.g2bulk_cost_usd * 100) / 100.0 THEN o.event_compare_price
          ELSE public.store_price_from_cost(o.g2bulk_cost_usd, v_store, v_step)
        END
      WHEN o.pricing_mode = 'margin' THEN
        public.store_price_from_cost(o.g2bulk_cost_usd, coalesce(o.pricing_margin_percent, v_store), v_step)
      ELSE public.store_price_from_cost(o.g2bulk_cost_usd, v_store, v_step)
    END
    WHERE o.g2bulk_cost_usd > 0 AND coalesce(o.is_sale, false) = false;
    GET DIAGNOSTICS v_restored = ROW_COUNT;

    UPDATE public.offers SET event_compare_price = NULL WHERE event_compare_price IS NOT NULL;
  END IF;

  PERFORM set_config('echocore.event_transition', '1', true);
  UPDATE public.store_events
  SET status = 'ended', ended_at = now(), saved_markup_percent = NULL, updated_at = now()
  WHERE id = p_event_id;
  PERFORM set_config('echocore.event_transition', '', true);

  BEGIN
    PERFORM public.append_site_log('admin', 'event_ended', 'info', auth.uid(), NULL,
      jsonb_build_object('eventId', v_event.id, 'slug', v_event.slug, 'repriced', v_restored,
                         'storeMarkupRestored', v_event.saved_markup_percent));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'eventId', v_event.id, 'repriced', v_restored,
                            'storeMarkup', v_event.saved_markup_percent);
END;
$$;

REVOKE ALL ON FUNCTION public.start_store_event_internal(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.end_store_event_internal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_store_event_internal(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.end_store_event_internal(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.admin_start_store_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN public.start_store_event_internal(p_event_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_end_store_event(p_event_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  RETURN public.end_store_event_internal(p_event_id);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_start_store_event(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_end_store_event(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_start_store_event(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_end_store_event(uuid) TO authenticated, service_role;

-- Cron tick: end the running event when its time is up, then start a scheduled one that is due.
CREATE OR REPLACE FUNCTION public.run_store_events()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_ended uuid := NULL;
  v_started uuid := NULL;
BEGIN
  SELECT id INTO v_id FROM public.store_events
  WHERE status = 'active' AND ends_at IS NOT NULL AND ends_at <= now();
  IF v_id IS NOT NULL THEN
    PERFORM public.end_store_event_internal(v_id);
    v_ended := v_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.store_events WHERE status = 'active') THEN
    SELECT id INTO v_id FROM public.store_events
    WHERE status = 'scheduled' AND starts_at <= now() AND (ends_at IS NULL OR ends_at > now())
    ORDER BY starts_at LIMIT 1;
    IF v_id IS NOT NULL THEN
      PERFORM public.start_store_event_internal(v_id);
      v_started := v_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ended', v_ended, 'started', v_started);
END;
$$;
REVOKE ALL ON FUNCTION public.run_store_events() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_store_events() TO service_role;

-- 5. What customers see -------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.store_event_public_json(e public.store_events)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id', e.id, 'slug', e.slug,
    'title_ar', e.title_ar, 'title_en', e.title_en,
    'description_ar', e.description_ar, 'description_en', e.description_en,
    'note_ar', e.note_ar, 'note_en', e.note_en,
    'badge_ar', e.badge_ar, 'badge_en', e.badge_en,
    'look', e.look, 'theme', e.theme, 'options', e.options,
    'banner_image_url', e.banner_image_url,
    'starts_at', coalesce(e.started_at, e.starts_at), 'ends_at', coalesce(e.ended_at, e.ends_at),
    'status', e.status,
    'has_discount', e.markup_percent IS NOT NULL
  );
$$;
REVOKE ALL ON FUNCTION public.store_event_public_json(public.store_events) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_active_store_event()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.store_event_public_json(e)
  FROM public.store_events e
  WHERE e.status = 'active' AND (e.ends_at IS NULL OR e.ends_at > now())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_public_store_events()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(jsonb_agg(public.store_event_public_json(e) ORDER BY
           (e.status = 'active') DESC, (e.status = 'scheduled') DESC,
           coalesce(e.started_at, e.starts_at, e.created_at) DESC), '[]'::jsonb)
  FROM public.store_events e
  WHERE e.id IN (
    SELECT id FROM public.store_events
    WHERE status IN ('active', 'scheduled', 'ended')
    ORDER BY coalesce(started_at, starts_at, created_at) DESC
    LIMIT 30
  );
$$;

REVOKE ALL ON FUNCTION public.get_active_store_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_public_store_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_active_store_event() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_public_store_events() TO anon, authenticated, service_role;

-- 6. Schedule the tick (every 2 minutes) -----------------------------------------------------------------
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'store-events-tick';
    PERFORM cron.schedule('store-events-tick', '*/2 * * * *', 'SELECT public.run_store_events()');
  END IF;
END
$do$;
