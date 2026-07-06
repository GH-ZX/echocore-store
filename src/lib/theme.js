import { supabase } from './supabase';

export const THEME_STORAGE_KEY = 'echocore-theme';

export const DEFAULT_THEME = {
  'bg-primary': '#040812',
  'bg-surface': '#0a1329',
  'bg-elevated': '#111c36',
  'bg-header': 'rgba(6, 11, 25, 0.92)',
  'text-primary': '#f0f4f8',
  'text-secondary': '#a8b4c4',
  'text-muted': '#6e7d92',
  accent: '#22d3ee',
  'accent-hover': '#67e8f9',
  'accent-dark': '#164e63',
  border: '#1e293b',
  'border-strong': '#334155',
  success: '#22c55e',
  error: '#ef4444',
  warning: '#eab308',
  'gradient-accent': 'linear-gradient(to right, #22d3ee, #3b82f6)',
  'gradient-surface': 'linear-gradient(to bottom, #0a1329, #040812)',
  'shadow-glow': '0 0 20px rgba(34, 211, 238, 0.25)',
  'shadow-card': '0 10px 30px -15px rgba(0, 0, 0, 0.6)',
  radius: '16px',
  'radius-sm': '12px',
  'radius-lg': '24px',
  'font-sans': "'Cairo', ui-sans-serif, system-ui, sans-serif",
  'sale-title': '#67e8f9',
  'sale-divider': 'rgba(103, 232, 249, 0.55)',
  'sale-badge': '#22d3ee',
  'sale-badge-text': '#040812',
  'games-title': '#94a3b8',
  'games-divider': 'rgba(34, 211, 238, 0.5)',
  'games-subtitle': '#94a3b8',
  'games-card-hover': '#22d3ee',
  'logo-url': '',
  'logo-filter-auto': 'true',
  'logo-hue-rotate': '0deg',
  'logo-glow': 'rgba(34, 211, 238, 0.3)',
  'logo-saturate': '1.04',
  'logo-brightness': '1.02',
  'logo-zoom': '1.7',

  /* Appearance */
  'background-type': 'aurora',

  /* Aurora / Background effects */
  'aurora-enabled': 'true',
  'aurora-responsive': 'true',
  'aurora-amplitude': '0.52',
  'aurora-speed': '0.32',
  'aurora-blend': '0.36',
  'aurora-intensity': '1',
  'aurora-height': '0.22',
  'bg-effect-opacity': '0.4',

  /* Dashboard accents */
  'dash-card-bg': 'color-mix(in srgb, var(--bg-surface) 92%, transparent)',
  'dash-stat-glow': 'color-mix(in srgb, var(--accent) 18%, transparent)',
  'dash-tab-active': 'var(--accent)',
};

export const BACKGROUND_TYPES = {
  aurora: { id: 'aurora', labelEn: 'Aurora Waves', labelAr: 'أمواج أورورا' },
  hexgrid: { id: 'hexgrid', labelEn: 'Cyber Hex Grid', labelAr: 'شبكة سداسية' },
  particles: { id: 'particles', labelEn: 'Particle Field', labelAr: 'حقل جزيئات' },
  nebula: { id: 'nebula', labelEn: 'Nebula Glow', labelAr: 'سديم متوهج' },
  scanlines: { id: 'scanlines', labelEn: 'Retro Scanlines', labelAr: 'خطوط رجعية' },
  starfield: { id: 'starfield', labelEn: 'Star Field', labelAr: 'حقل نجوم' },
  circuit: { id: 'circuit', labelEn: 'Circuit Pulse', labelAr: 'نبض الدوائر' },
  none: { id: 'none', labelEn: 'Solid Only', labelAr: 'لون صلب فقط' },
};

/** Background / motion settings — kept when switching color presets */
export const APPEARANCE_THEME_KEYS = [
  'background-type',
  'aurora-enabled',
  'aurora-responsive',
  'aurora-amplitude',
  'aurora-speed',
  'aurora-blend',
  'aurora-intensity',
  'aurora-height',
  'bg-effect-opacity',
  'logo-url',
  'logo-filter-auto',
  'logo-hue-rotate',
  'logo-glow',
  'logo-saturate',
  'logo-brightness',
  'logo-zoom',
];

export function pickAppearanceOverrides(overrides = {}) {
  return Object.fromEntries(
    APPEARANCE_THEME_KEYS
      .filter((key) => overrides[key] != null && String(overrides[key]).trim() !== '')
      .map((key) => [key, overrides[key]]),
  );
}

export function mergeThemeOverrides(base = {}, patch = {}) {
  return sanitizeThemeOverrides({ ...base, ...patch });
}

const LOGO_REFERENCE_HUE = 186;

export const THEME_PRESETS = {
  cyber: {
    id: 'cyber',
    labelEn: 'Cyber Cyan',
    labelAr: 'سيان سايبر',
    overrides: {},
  },
  purple: {
    id: 'purple',
    labelEn: 'Purple Neon',
    labelAr: 'بنفسجي نيون',
    overrides: {
      'bg-primary': '#07050f',
      'bg-surface': '#100a1c',
      'bg-elevated': '#18102a',
      'text-primary': '#ede9fe',
      'text-secondary': '#a8a3c4',
      'text-muted': '#6b6588',
      accent: '#a855f7',
      'accent-hover': '#c084fc',
      'accent-dark': '#581c87',
      border: '#2a1f42',
      'border-strong': '#4c3570',
    },
  },
  emerald: {
    id: 'emerald',
    labelEn: 'Emerald Gaming',
    labelAr: 'زمردي ألعاب',
    overrides: {
      'bg-primary': '#031208',
      'bg-surface': '#071f14',
      'bg-elevated': '#0f2e1f',
      'text-primary': '#e8f8f0',
      'text-secondary': '#8fb8a8',
      'text-muted': '#5a8a78',
      accent: '#34d399',
      'accent-hover': '#6ee7b7',
      'accent-dark': '#065f46',
      border: '#14532d',
      'border-strong': '#166534',
    },
  },
  rose: {
    id: 'rose',
    labelEn: 'Rose Arcade',
    labelAr: 'وردي أركيد',
    overrides: {
      'bg-primary': '#10050a',
      'bg-surface': '#1a0a12',
      'bg-elevated': '#261018',
      'text-primary': '#fce7f3',
      'text-secondary': '#c4a0b0',
      'text-muted': '#8a6a78',
      accent: '#fb7185',
      'accent-hover': '#fda4af',
      'accent-dark': '#9f1239',
      border: '#4a2030',
      'border-strong': '#6b3048',
    },
  },
  amber: {
    id: 'amber',
    labelEn: 'Amber Warm',
    labelAr: 'كهرماني دافئ',
    overrides: {
      'bg-primary': '#0e0904',
      'bg-surface': '#181008',
      'bg-elevated': '#24180c',
      'text-primary': '#fff7ed',
      'text-secondary': '#c4a882',
      'text-muted': '#8a7558',
      accent: '#fbbf24',
      'accent-hover': '#fcd34d',
      'accent-dark': '#92400e',
      border: '#3d2a10',
      'border-strong': '#5c4018',
    },
  },
  ocean: {
    id: 'ocean',
    labelEn: 'Ocean Deep',
    labelAr: 'أزرق محيطي',
    overrides: {
      'bg-primary': '#020b19',
      'bg-surface': '#041530',
      'bg-elevated': '#0a1f42',
      'text-primary': '#e8f0fc',
      'text-secondary': '#8aa8d4',
      'text-muted': '#5a78a8',
      accent: '#3b82f6',
      'accent-hover': '#60a5fa',
      'accent-dark': '#1e3a8a',
      border: '#172554',
      'border-strong': '#1d4ed8',
    },
  },
  cherry: {
    id: 'cherry',
    labelEn: 'Cherry Blossom',
    labelAr: 'ساكورا وردي',
    overrides: {
      'bg-primary': '#12050a',
      'bg-surface': '#1c0a12',
      'bg-elevated': '#281018',
      'text-primary': '#fce8f0',
      'text-secondary': '#c4a0b4',
      'text-muted': '#8a6a7a',
      accent: '#f472b6',
      'accent-hover': '#f9a8d4',
      'accent-dark': '#831843',
      border: '#4a2038',
      'border-strong': '#6b3050',
    },
  },
  gold: {
    id: 'gold',
    labelEn: 'Midnight Gold',
    labelAr: 'ذهبي ليلي',
    overrides: {
      'bg-primary': '#0a0906',
      'bg-surface': '#14120c',
      'bg-elevated': '#1e1a12',
      'text-primary': '#fffbeb',
      'text-secondary': '#c4b896',
      'text-muted': '#8a8068',
      accent: '#f59e0b',
      'accent-hover': '#fbbf24',
      'accent-dark': '#78350f',
      border: '#3d3210',
      'border-strong': '#5c4818',
    },
  },
  frost: {
    id: 'frost',
    labelEn: 'Frost White',
    labelAr: 'أبيض ثلجي',
    overrides: {
      'bg-primary': '#0c1220',
      'bg-surface': '#151e2e',
      'bg-elevated': '#1e2a3e',
      'text-primary': '#f8fafc',
      'text-secondary': '#b8c4d4',
      'text-muted': '#7a8a9e',
      accent: '#94a3b8',
      'accent-hover': '#cbd5e1',
      'accent-dark': '#64748b',
      border: '#334155',
      'border-strong': '#475569',
    },
  },
  lava: {
    id: 'lava',
    labelEn: 'Lava Red',
    labelAr: 'حمم بركانية',
    overrides: {
      'bg-primary': '#100404',
      'bg-surface': '#1a0808',
      'bg-elevated': '#260e0e',
      'text-primary': '#fce8e8',
      'text-secondary': '#c49090',
      'text-muted': '#8a6060',
      accent: '#ef4444',
      'accent-hover': '#f87171',
      'accent-dark': '#7f1d1d',
      border: '#4a1818',
      'border-strong': '#6b2424',
    },
  },
  mint: {
    id: 'mint',
    labelEn: 'Neo Mint',
    labelAr: 'نعناعي حديث',
    overrides: {
      'bg-primary': '#030f0e',
      'bg-surface': '#071f1c',
      'bg-elevated': '#0d2f2a',
      'text-primary': '#e8faf8',
      'text-secondary': '#88c4bc',
      'text-muted': '#5a9088',
      accent: '#2dd4bf',
      'accent-hover': '#5eead4',
      'accent-dark': '#115e59',
      border: '#134e4a',
      'border-strong': '#0f766e',
    },
  },
};

export const THEME_FIELD_GROUPS = [
  { id: 'core', labelEn: 'Core colors', labelAr: 'الألوان الأساسية' },
  { id: 'header', labelEn: 'Header & Shell', labelAr: 'الهيدر والإطار' },
  { id: 'dashboard', labelEn: 'Admin Dashboard', labelAr: 'لوحة التحكم' },
  { id: 'sale', labelEn: 'Home Sale Offers', labelAr: 'عروض الخصم في الرئيسية' },
  { id: 'games', labelEn: 'Home Games', labelAr: 'الألعاب في الرئيسية' },
];

export const EDITABLE_THEME_FIELDS = [
  { key: 'bg-primary', group: 'core', labelEn: 'Primary background', labelAr: 'الخلفية الرئيسية', type: 'color' },
  { key: 'bg-surface', group: 'core', labelEn: 'Surface background', labelAr: 'خلفية السطح', type: 'color' },
  { key: 'bg-elevated', group: 'core', labelEn: 'Elevated background', labelAr: 'خلفية مرتفعة', type: 'color' },
  { key: 'text-primary', group: 'core', labelEn: 'Primary text', labelAr: 'النص الرئيسي', type: 'color' },
  { key: 'text-secondary', group: 'core', labelEn: 'Secondary text', labelAr: 'النص الثانوي', type: 'color' },
  { key: 'text-muted', group: 'core', labelEn: 'Muted text', labelAr: 'النص الخافت', type: 'color' },
  { key: 'accent', group: 'core', labelEn: 'Accent color', labelAr: 'لون التمييز', type: 'color' },
  { key: 'accent-hover', group: 'core', labelEn: 'Accent hover', labelAr: 'تمييز عند التمرير', type: 'color' },
  { key: 'border', group: 'core', labelEn: 'Border', labelAr: 'الحدود', type: 'color' },
  { key: 'success', group: 'core', labelEn: 'Success', labelAr: 'نجاح', type: 'color' },
  { key: 'error', group: 'core', labelEn: 'Error', labelAr: 'خطأ', type: 'color' },
  { key: 'warning', group: 'core', labelEn: 'Warning', labelAr: 'تحذير', type: 'color' },
  { key: 'bg-header', group: 'header', labelEn: 'Header background', labelAr: 'خلفية الهيدر', type: 'color' },
  { key: 'dash-card-bg', group: 'dashboard', labelEn: 'Dashboard card fill', labelAr: 'خلفية بطاقات اللوحة', type: 'text' },
  { key: 'dash-stat-glow', group: 'dashboard', labelEn: 'Dashboard stat glow', labelAr: 'توهج إحصائيات اللوحة', type: 'text' },
  { key: 'dash-tab-active', group: 'dashboard', labelEn: 'Dashboard active tab', labelAr: 'تبويب اللوحة النشط', type: 'color' },
  { key: 'sale-title', group: 'sale', labelEn: 'Sale Offers title', labelAr: 'عنوان عروض الخصم', type: 'color' },
  { key: 'sale-divider', group: 'sale', labelEn: 'Sale Offers divider', labelAr: 'خط عروض الخصم', type: 'color' },
  { key: 'sale-badge', group: 'sale', labelEn: 'Sale badge', labelAr: 'شارة الخصم', type: 'color' },
  { key: 'sale-badge-text', group: 'sale', labelEn: 'Sale badge text', labelAr: 'نص شارة الخصم', type: 'color' },
  { key: 'games-title', group: 'games', labelEn: 'Games title', labelAr: 'عنوان الألعاب', type: 'color' },
  { key: 'games-divider', group: 'games', labelEn: 'Games divider', labelAr: 'خط الألعاب', type: 'color' },
  { key: 'games-subtitle', group: 'games', labelEn: 'Games subtitle', labelAr: 'النص الفرعي للألعاب', type: 'color' },
  { key: 'games-card-hover', group: 'games', labelEn: 'Game card hover border', labelAr: 'حد البطاقة عند التمرير', type: 'color' },
];

function parseHex(hex) {
  const value = hex.replace('#', '').trim();
  if (value.length === 3) {
    return {
      r: parseInt(value[0] + value[0], 16),
      g: parseInt(value[1] + value[1], 16),
      b: parseInt(value[2] + value[2], 16),
    };
  }
  if (value.length !== 6) return null;
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

function hexToRgba(hex, alpha = 1) {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function accentGlow(accent) {
  const rgb = parseHex(accent);
  if (!rgb) return DEFAULT_THEME['shadow-glow'];
  return `0 0 20px rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`;
}

function hexToHue(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return LOGO_REFERENCE_HUE;

  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  if (max === min) return LOGO_REFERENCE_HUE;

  const delta = max - min;
  let hue = 0;

  if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) / 6;
  else if (max === g) hue = ((b - r) / delta + 2) / 6;
  else hue = ((r - g) / delta + 4) / 6;

  return hue * 360;
}

function normalizeHueDelta(degrees) {
  let delta = degrees;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function deriveLogoFilter(accent) {
  const accentHue = hexToHue(accent);
  const rawDelta = normalizeHueDelta(accentHue - LOGO_REFERENCE_HUE);
  // Partial shift keeps the mark recognizable; cap avoids muddy warm hues.
  const rotate = Math.round(Math.max(-90, Math.min(90, rawDelta * 0.5)));

  return {
    'logo-hue-rotate': `${rotate}deg`,
    'logo-glow': hexToRgba(accent, 0.3),
    'logo-saturate': '1.04',
    'logo-brightness': '1.02',
  };
}

export function parseLogoGlow(value) {
  const match = String(value || '').match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/);
  if (!match) return { r: 34, g: 211, b: 238, a: 0.3 };
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] != null ? Number(match[4]) : 1,
  };
}

export function formatLogoGlow(r, g, b, a) {
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function glowToHex(value) {
  const { r, g, b } = parseLogoGlow(value);
  const toHex = (n) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function parseHueDegrees(value) {
  const match = String(value || '').match(/(-?\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : 0;
}

export function getStoredThemeOverrides() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return {};
    return sanitizeThemeOverrides(JSON.parse(raw));
  } catch {
    return {};
  }
}

export function getActiveLogoUrl(overrides = null) {
  const source = overrides ?? getStoredThemeOverrides();
  const custom = source['logo-url']?.trim();
  return custom || null;
}

function deriveGamesColors(base, overrides, accent) {
  if (!overrides['games-title']) {
    base['games-title'] = base['text-secondary'];
  }

  if (!overrides['games-divider']) {
    base['games-divider'] = accent.startsWith('#')
      ? hexToRgba(accent, 0.5)
      : DEFAULT_THEME['games-divider'];
  }

  if (!overrides['games-subtitle']) {
    base['games-subtitle'] = base['text-secondary'];
  }

  if (!overrides['games-card-hover']) {
    base['games-card-hover'] = accent;
  }
}

function blendHex(hexA, hexB, weightA = 0.5) {
  const a = parseHex(hexA);
  const b = parseHex(hexB);
  if (!a || !b) return hexA;
  const w = Math.min(1, Math.max(0, weightA));
  const mix = (x, y) => Math.round(x * w + y * (1 - w));
  const toHex = (n) => n.toString(16).padStart(2, '0');
  return `#${toHex(mix(a.r, b.r))}${toHex(mix(a.g, b.g))}${toHex(mix(a.b, b.b))}`;
}

function deriveTextColors(base, overrides) {
  const primary = base['text-primary'];
  if (!primary?.startsWith('#')) return;

  if (!overrides['text-secondary']) {
    base['text-secondary'] = blendHex(primary, '#8b9cb0', 0.62);
  }
  if (!overrides['text-muted']) {
    base['text-muted'] = blendHex(primary, '#5c6d82', 0.38);
  }
}

function deriveSaleColors(base, overrides, accent) {
  const saleTitle = overrides['sale-title'] || base['accent-hover'] || accent;

  if (!overrides['sale-title']) {
    base['sale-title'] = saleTitle;
  }

  if (!overrides['sale-divider']) {
    base['sale-divider'] = saleTitle.startsWith('#')
      ? hexToRgba(saleTitle, 0.55)
      : DEFAULT_THEME['sale-divider'];
  }

  if (!overrides['sale-badge']) {
    base['sale-badge'] = accent;
  }

  if (!overrides['sale-badge-text']) {
    base['sale-badge-text'] = '#040812';
  }
}

export function buildFullTheme(overrides = {}) {
  const base = { ...DEFAULT_THEME, ...overrides };
  const accent = overrides.accent || base.accent;

  if (!overrides['bg-header'] && base['bg-primary']?.startsWith('#')) {
    base['bg-header'] = hexToRgba(base['bg-primary'], 0.92);
  }

  if (!overrides['gradient-accent']) {
    base['gradient-accent'] = `linear-gradient(to right, ${accent}, #3b82f6)`;
  }

  if (!overrides['gradient-surface']) {
    base['gradient-surface'] = `linear-gradient(to bottom, ${base['bg-surface']}, ${base['bg-primary']})`;
  }

  if (!overrides['shadow-glow']) {
    base['shadow-glow'] = accentGlow(accent);
  }

  deriveTextColors(base, overrides);
  deriveSaleColors(base, overrides, accent);
  deriveGamesColors(base, overrides, accent);

  const logoAuto = (overrides['logo-filter-auto'] ?? base['logo-filter-auto'] ?? 'true') !== 'false';
  if (logoAuto) {
    Object.assign(base, deriveLogoFilter(accent));
  }

  for (const key of ['logo-hue-rotate', 'logo-glow', 'logo-saturate', 'logo-brightness', 'logo-zoom']) {
    if (!base[key]) base[key] = DEFAULT_THEME[key];
  }

  return base;
}

const STRIP_THEME_KEYS = new Set(['color-mode']);

export function sanitizeThemeOverrides(overrides = {}) {
  return Object.fromEntries(
    Object.entries(overrides).filter(([key]) => !STRIP_THEME_KEYS.has(key)),
  );
}

export function applyTheme(overrides = {}, { persist = true, replace = false } = {}) {
  let clean = sanitizeThemeOverrides(overrides);

  if (!replace) {
    try {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored) {
        clean = mergeThemeOverrides(JSON.parse(stored), clean);
      }
    } catch {
      // ignore corrupt cache
    }
  }

  const theme = buildFullTheme(clean);
  const root = document.documentElement;

  Object.entries(theme).forEach(([key, value]) => {
    if (value != null && value !== '') {
      root.style.setProperty(`--${key}`, value);
    }
  });

  if (!clean['logo-url']?.trim()) {
    root.style.removeProperty('--logo-url');
  }

  root.style.setProperty('--text-sec', theme['text-secondary'] || DEFAULT_THEME['text-secondary']);
  root.removeAttribute('data-color-mode');
  root.setAttribute('data-background-type', theme['background-type'] || 'aurora');

  if (persist) {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(clean));
    } catch {
      // ignore quota / private mode
    }
  }

  window.dispatchEvent(new CustomEvent('themechange'));

  return theme;
}

export function applyCachedTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return false;
    applyTheme(JSON.parse(raw), { replace: true });
    return true;
  } catch {
    return false;
  }
}

export function resetTheme() {
  const root = document.documentElement;
  Object.keys(DEFAULT_THEME).forEach((key) => {
    root.style.removeProperty(`--${key}`);
  });
  try {
    localStorage.removeItem(THEME_STORAGE_KEY);
  } catch {
    // ignore
  }
  window.dispatchEvent(new CustomEvent('themechange'));
}

export async function fetchSiteTheme() {
  const { data, error } = await supabase.rpc('get_site_theme');
  if (error) {
    if (error.message?.includes('get_site_theme')) {
      return null;
    }
    console.error('get_site_theme:', error);
    return null;
  }

  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return {};
  }

  return data;
}

export function normalizeThemeOverrides(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return sanitizeThemeOverrides(
    Object.fromEntries(
      Object.entries(value).filter(([key, val]) => key in DEFAULT_THEME && typeof val === 'string' && val.trim()),
    ),
  );
}

export function detectPresetId(overrides = {}) {
  const entries = Object.entries(normalizeThemeOverrides(overrides));
  if (entries.length === 0) return 'cyber';

  for (const preset of Object.values(THEME_PRESETS)) {
    if (preset.id === 'cyber') continue;
    const presetEntries = Object.entries(preset.overrides);
    const matches = presetEntries.every(([key, val]) => overrides[key] === val);
    if (matches && entries.length === presetEntries.length) {
      return preset.id;
    }
  }

  return 'custom';
}