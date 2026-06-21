import { supabase } from './supabase';

export const THEME_STORAGE_KEY = 'echocore-theme';

export const DEFAULT_THEME = {
  'bg-primary': '#040812',
  'bg-surface': '#0a1329',
  'bg-elevated': '#111c36',
  'bg-header': 'rgba(6, 11, 25, 0.92)',
  'text-primary': '#f1f5f9',
  'text-secondary': '#94a3b8',
  'text-muted': '#64748b',
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
  'logo-hue-rotate': '0deg',
  'logo-glow': 'rgba(34, 211, 238, 0.5)',
  'logo-saturate': '1.12',
  'logo-brightness': '1.03',
};

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
      'bg-primary': '#080612',
      'bg-surface': '#120a24',
      'bg-elevated': '#1a1038',
      accent: '#a855f7',
      'accent-hover': '#c084fc',
      'accent-dark': '#581c87',
      border: '#2e1065',
      'border-strong': '#4c1d95',
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
      'bg-primary': '#12060c',
      'bg-surface': '#1f0a14',
      'bg-elevated': '#2d1220',
      accent: '#fb7185',
      'accent-hover': '#fda4af',
      'accent-dark': '#9f1239',
      border: '#4c0519',
      'border-strong': '#881337',
    },
  },
  amber: {
    id: 'amber',
    labelEn: 'Amber Warm',
    labelAr: 'كهرماني دافئ',
    overrides: {
      'bg-primary': '#100a04',
      'bg-surface': '#1c1208',
      'bg-elevated': '#2a1a0c',
      accent: '#fbbf24',
      'accent-hover': '#fcd34d',
      'accent-dark': '#92400e',
      border: '#451a03',
      'border-strong': '#78350f',
      'text-primary': '#fff7ed',
    },
  },
};

export const THEME_FIELD_GROUPS = [
  { id: 'core', labelEn: 'Core colors', labelAr: 'الألوان الأساسية' },
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

function deriveLogoFilter(accent) {
  const accentHue = hexToHue(accent);
  const rotate = Math.round(accentHue - LOGO_REFERENCE_HUE);

  return {
    'logo-hue-rotate': `${rotate}deg`,
    'logo-glow': hexToRgba(accent, 0.5),
    'logo-saturate': '1.12',
    'logo-brightness': '1.03',
  };
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

  deriveSaleColors(base, overrides, accent);
  deriveGamesColors(base, overrides, accent);
  Object.assign(base, deriveLogoFilter(accent));

  return base;
}

export function applyTheme(overrides = {}) {
  const theme = buildFullTheme(overrides);
  const root = document.documentElement;

  Object.entries(theme).forEach(([key, value]) => {
    if (value != null && value !== '') {
      root.style.setProperty(`--${key}`, value);
    }
  });

  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // ignore quota / private mode
  }

  return theme;
}

export function applyCachedTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (!raw) return false;
    applyTheme(JSON.parse(raw));
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

  return Object.fromEntries(
    Object.entries(value).filter(([key, val]) => key in DEFAULT_THEME && typeof val === 'string' && val.trim())
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