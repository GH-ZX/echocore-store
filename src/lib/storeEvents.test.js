import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));

const {
  EVENT_LOOKS,
  eventTimeLeft,
  getEventComparePrice,
  getEventDecor,
  getEventOptions,
  isEventLive,
  orderGamesForEvent,
  percentOff,
  splitNoteLinks,
  withEventTheme,
} = await import('./storeEvents');
const { DEFAULT_THEME, SIGNATURE_THEME_PRESETS, THEME_PRESETS, detectPresetId, normalizeThemeOverrides } = await import('./theme');

const now = Date.parse('2026-11-11T12:00:00Z');
const live = { id: 'e1', status: 'active', look: 'newborn', theme: {}, options: {}, ends_at: '2026-11-18T12:00:00Z' };

describe('event state', () => {
  it('is live only while active and before its end time', () => {
    expect(isEventLive(live, now)).toBe(true);
    expect(isEventLive({ ...live, ends_at: '2026-11-11T11:59:00Z' }, now)).toBe(false);
    expect(isEventLive({ ...live, status: 'scheduled' }, now)).toBe(false);
    expect(isEventLive({ ...live, ends_at: null }, now)).toBe(true);
    expect(isEventLive(null, now)).toBe(false);
  });

  it('counts down to the end', () => {
    expect(eventTimeLeft({ ends_at: '2026-11-12T13:01:05Z' }, now)).toMatchObject({ days: 1, hours: 1, minutes: 1, seconds: 5 });
    expect(eventTimeLeft({ ends_at: '2026-11-10T00:00:00Z' }, now).ms).toBe(0);
    expect(eventTimeLeft({ ends_at: null }, now)).toBeNull();
  });

  it('fills in default options and the look decoration', () => {
    expect(getEventOptions({ options: { banner: false } })).toMatchObject({ banner: false, countdown: true, carouselSlugs: [] });
    expect(getEventDecor(live)).toBe('balloons');
    expect(getEventDecor({ ...live, options: { decor: 'none' } })).toBe('none');
    expect(getEventDecor({ ...live, options: { decor: 'lasers' } })).toBe('balloons');
  });
});

describe('event look', () => {
  const base = { accent: '#111111', 'logo-url': 'https://x/logo.png', radius: '4px' };

  it('layers the look over the site theme while live, and leaves the site theme alone otherwise', () => {
    const themed = withEventTheme(base, { ...live, ends_at: '2999-01-01T00:00:00Z' });
    expect(themed.accent).toBe(EVENT_LOOKS.newborn.theme.accent);
    expect(themed['logo-url']).toBe(base['logo-url']);
    expect(withEventTheme(base, { ...live, status: 'ended' })).toBe(base);
    expect(withEventTheme(base, { ...live, look: 'none', ends_at: '2999-01-01T00:00:00Z' })).toBe(base);
    expect(base.accent).toBe('#111111');
  });

  it('uses only real theme keys in every look', () => {
    for (const look of Object.values(EVENT_LOOKS)) {
      expect(Object.keys(normalizeThemeOverrides(look.theme))).toEqual(Object.keys(look.theme));
    }
  });
});

describe('event prices and order', () => {
  it('shows the old price only when it is really higher', () => {
    expect(getEventComparePrice({ price: 10.6, event_compare_price: 11.2 })).toBe(11.2);
    expect(getEventComparePrice({ price: 10.6, event_compare_price: 10.6 })).toBeNull();
    expect(getEventComparePrice({ price: 10.6, event_compare_price: null })).toBeNull();
    expect(getEventComparePrice({ price: 10.6, event_compare_price: 11.2 }, 11.5)).toBeNull();
    expect(percentOff(11.2, 10.6)).toBe(5);
    expect(percentOff(10, 10)).toBe(0);
  });

  it('puts the event products first while it is live', () => {
    const games = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];
    const event = { ...live, ends_at: '2999-01-01T00:00:00Z', options: { carouselSlugs: ['c', 'zzz', 'a'] } };
    expect(orderGamesForEvent(games, event).map((g) => g.slug)).toEqual(['c', 'a', 'b']);
    expect(orderGamesForEvent(games, { ...event, status: 'ended' })).toBe(games);
    expect(orderGamesForEvent(games, null)).toBe(games);
  });

  it('turns @handles in a note into Telegram links', () => {
    expect(splitNoteLinks('معك USDT؟ راسلنا @granger412 الآن')).toEqual([
      { text: 'معك USDT؟ راسلنا ' },
      { text: '@granger412', href: 'https://t.me/granger412' },
      { text: ' الآن' },
    ]);
    expect(splitNoteLinks('no handle a@b')).toEqual([{ text: 'no handle a@b' }]);
  });
});

describe('signature themes', () => {
  it('are detected as themselves and use real theme keys', () => {
    for (const preset of Object.values(SIGNATURE_THEME_PRESETS)) {
      expect(Object.keys(preset.overrides).every((key) => key in DEFAULT_THEME)).toBe(true);
      expect(detectPresetId({ ...preset.overrides, 'logo-url': 'x' })).toBe(preset.id);
    }
  });

  it('do not change how color presets are detected', () => {
    expect(detectPresetId({})).toBe('cyber');
    expect(detectPresetId({ ...THEME_PRESETS.emerald.overrides })).toBe('emerald');
  });
});
