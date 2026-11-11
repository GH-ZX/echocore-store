import { supabase } from './supabase';
import { applyTheme, getStoredThemeOverrides, normalizeThemeOverrides } from './theme';

// Store events: a time-boxed campaign run from Dashboard → Events. While one is live the storefront
// shows its banner, layers its look over the saved site theme (never saved, so the look reverts by
// itself when the event ends) and shows each pack's price from before the event struck through.
// Database: supabase/migrations/20261111090000_store_events.sql.

const CACHE_KEY = 'echocore-event';
const PREVIEW_KEY = 'echocore-event-preview';

/**
 * Event looks: theme overrides layered over the site theme + a decoration + banner art.
 * `swatch` is [background, accent, second accent] for the picker.
 */
export const EVENT_LOOKS = {
  newborn: {
    id: 'newborn',
    labelKey: 'eventLookNewborn',
    decor: 'balloons',
    art: '/events/newborn.svg',
    swatch: ['#07111f', '#5fb6ff', '#f5c76b'],
    theme: {
      'color-mode': 'dark',
      'bg-primary': '#07111f',
      'bg-surface': '#0d1b31',
      'bg-elevated': '#152744',
      'text-primary': '#eef6ff',
      'text-secondary': '#a9bcd6',
      'text-muted': '#7488a8',
      accent: '#5fb6ff',
      'accent-hover': '#8ccbff',
      'accent-2': '#f5c76b',
      'accent-dark': '#1d5fa8',
      border: '#1d3253',
      'border-strong': '#2c4873',
      price: '#f5c76b',
      'background-type': 'aurora',
      'bg-effect-opacity': '0.6',
      radius: '20px',
      'radius-sm': '14px',
      'radius-lg': '28px',
    },
  },
  celebration: {
    id: 'celebration',
    labelKey: 'eventLookCelebration',
    decor: 'confetti',
    art: '/events/celebration.svg',
    swatch: ['#0d0717', '#f5b83d', '#b98cff'],
    theme: {
      'color-mode': 'dark',
      'bg-primary': '#0d0717',
      'bg-surface': '#170d27',
      'bg-elevated': '#22143a',
      'text-primary': '#fbf6ee',
      'text-secondary': '#c9bcd8',
      'text-muted': '#9486a8',
      accent: '#f5b83d',
      'accent-hover': '#ffd06b',
      'accent-2': '#b98cff',
      'accent-dark': '#a8710d',
      border: '#30204c',
      'border-strong': '#463066',
      price: '#ffd06b',
      'background-type': 'mesh',
      'bg-effect-opacity': '0.6',
      radius: '18px',
      'radius-sm': '12px',
      'radius-lg': '26px',
    },
  },
  eid: {
    id: 'eid',
    labelKey: 'eventLookEid',
    decor: 'stars',
    art: '/events/eid.svg',
    swatch: ['#04130f', '#2fc48d', '#e9c46a'],
    theme: {
      'color-mode': 'dark',
      'bg-primary': '#04130f',
      'bg-surface': '#0a211a',
      'bg-elevated': '#113127',
      'text-primary': '#eefaf4',
      'text-secondary': '#a3c4b6',
      'text-muted': '#6f9484',
      accent: '#2fc48d',
      'accent-hover': '#5fdcab',
      'accent-2': '#e9c46a',
      'accent-dark': '#0f6e4c',
      border: '#17402f',
      'border-strong': '#215a43',
      price: '#e9c46a',
      'background-type': 'dots',
      'bg-effect-opacity': '0.5',
      radius: '16px',
      'radius-sm': '12px',
      'radius-lg': '24px',
    },
  },
  ramadan: {
    id: 'ramadan',
    labelKey: 'eventLookRamadan',
    decor: 'stars',
    art: '/events/ramadan.svg',
    swatch: ['#0a0920', '#e3b454', '#7f8cff'],
    theme: {
      'color-mode': 'dark',
      'bg-primary': '#0a0920',
      'bg-surface': '#121136',
      'bg-elevated': '#1b1a4a',
      'text-primary': '#f4f1ff',
      'text-secondary': '#b5b2d9',
      'text-muted': '#8482ad',
      accent: '#e3b454',
      'accent-hover': '#f2cd7c',
      'accent-2': '#7f8cff',
      'accent-dark': '#9a7420',
      border: '#26255c',
      'border-strong': '#37367c',
      price: '#f2cd7c',
      'background-type': 'aurora',
      'bg-effect-opacity': '0.5',
      radius: '18px',
      'radius-sm': '12px',
      'radius-lg': '26px',
    },
  },
  sale: {
    id: 'sale',
    labelKey: 'eventLookSale',
    decor: 'confetti',
    art: '/events/sale.svg',
    swatch: ['#12070a', '#ff5a5f', '#ffc145'],
    theme: {
      'color-mode': 'dark',
      'bg-primary': '#12070a',
      'bg-surface': '#1e0d12',
      'bg-elevated': '#2b141b',
      'text-primary': '#fff1f1',
      'text-secondary': '#d6b1b5',
      'text-muted': '#a17f84',
      accent: '#ff5a5f',
      'accent-hover': '#ff8387',
      'accent-2': '#ffc145',
      'accent-dark': '#a81f25',
      border: '#45202a',
      'border-strong': '#63303c',
      price: '#ffc145',
      'background-type': 'mesh',
      'bg-effect-opacity': '0.55',
      radius: '14px',
      'radius-sm': '10px',
      'radius-lg': '22px',
    },
  },
  winter: {
    id: 'winter',
    labelKey: 'eventLookWinter',
    decor: 'snow',
    art: '/events/winter.svg',
    swatch: ['#06121b', '#7fd8ff', '#ffffff'],
    theme: {
      'color-mode': 'dark',
      'bg-primary': '#06121b',
      'bg-surface': '#0c1f2e',
      'bg-elevated': '#132d42',
      'text-primary': '#f0f9ff',
      'text-secondary': '#a8c5d8',
      'text-muted': '#7393a8',
      accent: '#7fd8ff',
      'accent-hover': '#aee6ff',
      'accent-2': '#e6f6ff',
      'accent-dark': '#1f7fb0',
      border: '#1b3a52',
      'border-strong': '#285370',
      price: '#aee6ff',
      'background-type': 'aurora',
      'bg-effect-opacity': '0.5',
      radius: '22px',
      'radius-sm': '14px',
      'radius-lg': '30px',
    },
  },
  none: {
    id: 'none',
    labelKey: 'eventLookNone',
    decor: 'none',
    art: '/events/celebration.svg',
    swatch: null,
    theme: {},
  },
};

export const EVENT_DECORS = ['balloons', 'confetti', 'stars', 'snow', 'none'];

export const DEFAULT_EVENT_OPTIONS = {
  banner: true,
  countdown: true,
  comparePrices: true,
  carouselSlide: true,
  decor: null, // null = the look's own decoration
  carouselSlugs: [], // game slugs shown first (in this order) while the event runs
};

export function getEventLook(event) {
  return EVENT_LOOKS[event?.look] || EVENT_LOOKS.celebration;
}

export function getEventOptions(event) {
  const raw = event?.options && typeof event.options === 'object' ? event.options : {};
  return {
    ...DEFAULT_EVENT_OPTIONS,
    ...raw,
    carouselSlugs: Array.isArray(raw.carouselSlugs) ? raw.carouselSlugs.map(String) : [],
  };
}

export function getEventDecor(event) {
  const chosen = getEventOptions(event).decor;
  return EVENT_DECORS.includes(chosen) ? chosen : getEventLook(event).decor;
}

export function getEventArt(event) {
  return String(event?.banner_image_url || '').trim() || getEventLook(event).art;
}

export function eventText(event, lang, field) {
  if (!event) return '';
  const ar = String(event[`${field}_ar`] || '').trim();
  const en = String(event[`${field}_en`] || '').trim();
  return lang === 'ar' ? (ar || en) : (en || ar);
}

/** Running right now: status active and not past its end time. */
export function isEventLive(event, now = Date.now()) {
  if (!event || event.status !== 'active') return false;
  const end = event.ends_at ? new Date(event.ends_at).getTime() : null;
  return end == null || !Number.isFinite(end) || end > now;
}

export function eventTimeLeft(event, now = Date.now()) {
  const end = event?.ends_at ? new Date(event.ends_at).getTime() : NaN;
  if (!Number.isFinite(end)) return null;
  const ms = Math.max(0, end - now);
  const totalSeconds = Math.floor(ms / 1000);
  return {
    ms,
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

/** Theme overrides for the site while this event is live (site theme first, then the look, then custom). */
export function withEventTheme(baseOverrides = {}, event = null) {
  if (!isEventLive(event)) return baseOverrides;
  const look = getEventLook(event);
  const custom = normalizeThemeOverrides(event.theme);
  if (look.id === 'none' && Object.keys(custom).length === 0) return baseOverrides;
  return { ...baseOverrides, ...look.theme, ...custom };
}

/** "@handle" in an event note becomes a Telegram link. */
export function splitNoteLinks(text = '') {
  const parts = [];
  const pattern = /@([A-Za-z][A-Za-z0-9_]{3,31})/g;
  let last = 0;
  let match = pattern.exec(text);
  while (match) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index) });
    parts.push({ text: match[0], href: `https://t.me/${match[1]}` });
    last = match.index + match[0].length;
    match = pattern.exec(text);
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

/** A pack's price from before the event, when it is really higher than what the customer pays now. */
export function getEventComparePrice(offer, shownPrice = null) {
  const compare = Number(offer?.event_compare_price);
  const price = Number(shownPrice ?? offer?.price);
  if (!Number.isFinite(compare) || !Number.isFinite(price) || price <= 0) return null;
  return compare > price + 0.004 ? compare : null;
}

export function percentOff(compare, price) {
  const c = Number(compare);
  const p = Number(price);
  if (!(c > 0) || !(p > 0) || p >= c) return 0;
  return Math.round(((c - p) / c) * 100);
}

/** Games listed in the event's carouselSlugs come first, in that order; the rest keep their order. */
export function orderGamesForEvent(games = [], event = null) {
  const slugs = isEventLive(event) ? getEventOptions(event).carouselSlugs : [];
  if (slugs.length === 0) return games;
  const rank = new Map(slugs.map((slug, index) => [slug, index]));
  const first = games.filter((g) => rank.has(g.slug)).sort((a, b) => rank.get(a.slug) - rank.get(b.slug));
  const rest = games.filter((g) => !rank.has(g.slug));
  return [...first, ...rest];
}

// ── The active event, shared by every component (useActiveEvent) ────────────────────────────────

let activeEvent; // undefined = not loaded yet, null = none
let baseTheme = null;
let expiryTimer = null;
const listeners = new Set();

function readJson(storage, key) {
  try {
    const raw = storage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage, key, value) {
  try {
    if (value == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode / quota */
  }
}

let preview; // undefined = not read yet
function previewEvent() {
  if (preview === undefined) {
    const draft = typeof sessionStorage === 'undefined' ? null : readJson(sessionStorage, PREVIEW_KEY);
    preview = draft ? { ...draft, status: 'active', _preview: true } : null;
  }
  return preview;
}

export function getActiveEventSnapshot() {
  const preview = previewEvent();
  if (preview) return preview;
  if (activeEvent === undefined && typeof localStorage !== 'undefined') {
    const cached = readJson(localStorage, CACHE_KEY);
    activeEvent = isEventLive(cached) ? cached : null;
  }
  return isEventLive(activeEvent) ? activeEvent : null;
}

let snapshotCache = null;
let snapshotVersion = -1;
let version = 0; // bumped by notify() whenever the event, the preview or liveness changes
/** Stable reference for useSyncExternalStore (recomputed only after a change). */
export function getStableActiveEvent() {
  if (snapshotVersion !== version) {
    snapshotVersion = version;
    snapshotCache = getActiveEventSnapshot();
  }
  return snapshotCache;
}

export function subscribeActiveEvent(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function applyEventAttributes(event) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (isEventLive(event)) {
    root.setAttribute('data-event-look', getEventLook(event).id);
    root.setAttribute('data-event-decor', getEventDecor(event));
  } else {
    root.removeAttribute('data-event-look');
    root.removeAttribute('data-event-decor');
  }
}

/** Apply the saved site theme with the live event's look on top. */
export function applySiteTheme(overrides = null) {
  if (overrides) baseTheme = normalizeThemeOverrides(overrides);
  const event = getActiveEventSnapshot();
  applyEventAttributes(event);
  if (baseTheme != null) {
    applyTheme(withEventTheme(baseTheme, event), { replace: true });
  } else if (event) {
    // Before the saved theme arrives: put the look over whatever was painted from the last visit.
    applyTheme(withEventTheme(getStoredThemeOverrides(), event), { replace: true });
  }
}

/** First paint: show the look of an event already known from the last visit (or a preview). */
export function bootstrapEventLook() {
  if (getActiveEventSnapshot()) applySiteTheme();
}

function notify() {
  version += 1;
  applySiteTheme();
  listeners.forEach((listener) => listener());
}

function scheduleExpiry(event) {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  const end = event?.ends_at ? new Date(event.ends_at).getTime() : NaN;
  if (!Number.isFinite(end)) return;
  const delay = end - Date.now();
  if (delay <= 0 || delay > 2 ** 31 - 1) return;
  expiryTimer = setTimeout(() => {
    activeEvent = null;
    writeJson(localStorage, CACHE_KEY, null);
    notify();
  }, delay + 500);
}

function setActiveEvent(event) {
  activeEvent = isEventLive(event) ? event : null;
  if (typeof localStorage !== 'undefined') writeJson(localStorage, CACHE_KEY, activeEvent);
  scheduleExpiry(activeEvent);
  notify();
}

/** Ask the server which event is running. A failed request keeps the last known answer. */
export async function loadActiveEvent() {
  const { data, error } = await supabase.rpc('get_active_store_event');
  if (error) {
    if (activeEvent === undefined) getActiveEventSnapshot();
    return getActiveEventSnapshot();
  }
  setActiveEvent(data && typeof data === 'object' && !Array.isArray(data) ? data : null);
  return getActiveEventSnapshot();
}

/** Dashboard preview: show an event (even an unsaved draft) on this browser tab only. */
export function setEventPreview(event) {
  if (typeof sessionStorage === 'undefined') return;
  writeJson(sessionStorage, PREVIEW_KEY, event || null);
  preview = undefined;
  notify();
}

export function isEventPreviewOn() {
  return !!previewEvent();
}

export async function fetchPublicEvents() {
  const { data, error } = await supabase.rpc('list_public_store_events');
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

// ── Dashboard ───────────────────────────────────────────────────────────────────────────────────

/** The running event's margin columns (admin only; null when none runs or the read fails). */
export async function fetchRunningAdminEvent() {
  const { data, error } = await supabase
    .from('store_events')
    .select('id, title_ar, title_en, markup_percent, saved_markup_percent, ends_at')
    .eq('status', 'active')
    .maybeSingle();
  return error ? null : (data || null);
}

export function slugifyEvent(value = '') {
  return String(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export async function fetchAdminEvents() {
  const { data, error } = await supabase
    .from('store_events')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

function cleanText(value, max) {
  const text = String(value || '').trim().slice(0, max);
  return text || null;
}

/** Create or update an event. Status changes only between draft and scheduled here. */
export async function saveAdminEvent(event) {
  const titleAr = String(event.title_ar || '').trim();
  const titleEn = String(event.title_en || '').trim();
  const markup = event.markup_percent === '' || event.markup_percent == null ? null : Number(event.markup_percent);
  const row = {
    slug: slugifyEvent(event.slug || titleEn || '') || `event-${Date.now().toString(36)}`,
    title_ar: (titleAr || titleEn).slice(0, 120),
    title_en: (titleEn || titleAr).slice(0, 120),
    description_ar: cleanText(event.description_ar, 1000),
    description_en: cleanText(event.description_en, 1000),
    note_ar: cleanText(event.note_ar, 300),
    note_en: cleanText(event.note_en, 300),
    badge_ar: cleanText(event.badge_ar, 40),
    badge_en: cleanText(event.badge_en, 40),
    look: EVENT_LOOKS[event.look] ? event.look : 'celebration',
    theme: normalizeThemeOverrides(event.theme),
    options: { ...getEventOptions(event) },
    banner_image_url: cleanText(event.banner_image_url, 1000),
    starts_at: event.starts_at || null,
    ends_at: event.ends_at || null,
  };
  // Prices are locked while the event runs (the database refuses the change).
  if (event.status !== 'active') {
    row.markup_percent = Number.isFinite(markup) ? markup : null;
    row.include_fixed = event.include_fixed !== false;
    row.status = event.status === 'scheduled' && row.starts_at ? 'scheduled' : 'draft';
  }
  const query = event.id
    ? supabase.from('store_events').update(row).eq('id', event.id)
    : supabase.from('store_events').insert(row);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deleteAdminEvent(id) {
  const { error } = await supabase.from('store_events').delete().eq('id', id);
  if (error) throw error;
}

export async function startAdminEvent(id) {
  const { data, error } = await supabase.rpc('admin_start_store_event', { p_event_id: id });
  if (error) throw error;
  await loadActiveEvent();
  return data;
}

export async function endAdminEvent(id) {
  const { data, error } = await supabase.rpc('admin_end_store_event', { p_event_id: id });
  if (error) throw error;
  await loadActiveEvent();
  return data;
}

/** Map the database's event errors to dashboard messages. */
export function eventErrorMessage(error, t = {}) {
  const message = String(error?.message || error || '');
  const map = {
    another_event_running: t.eventErrAnotherRunning,
    event_running_prices_locked: t.eventErrPricesLocked,
    event_running_end_first: t.eventErrEndFirst,
    event_status_use_start: t.eventErrUseStart,
    event_not_running: t.eventErrNotRunning,
    event_already_ended: t.eventErrAlreadyEnded,
    store_events_dates: t.eventErrDates,
    store_events_slug_key: t.eventErrSlugTaken,
  };
  const key = Object.keys(map).find((code) => message.includes(code));
  return (key && map[key]) || message || t.error;
}
