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
  'logo-core-color': '',
  'logo-bg-color': '',
  'logo-bg-enabled': 'true',
  'logo-filter-auto': 'true',
  'logo-hue-rotate': '0deg',
  'logo-glow': 'rgba(34, 211, 238, 0.3)',
  'logo-saturate': '1.04',
  'logo-brightness': '1.02',
  'logo-zoom': '1',
  'logo-pos-x': '50',
  'logo-pos-y': '50',
  'logo-bg': 'color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))',
  'logo-bg-hover': 'color-mix(in srgb, var(--accent) 12%, var(--bg-elevated))',
  'logo-border': 'color-mix(in srgb, var(--accent) 22%, var(--border))',

  /* Appearance */
  'color-mode': 'dark',
  'glows-enabled': 'true',
  'surfaces-opacity-enabled': 'false',
  'surfaces-opacity': '0.88',
  'surfaces-style': 'solid',
  'surfaces-glass-blur': '24',
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

  /* Circuit pulse */
  'circuit-speed': '1',
  'circuit-pulse-speed': '1',
  'circuit-density': '1',
  'circuit-pulses': '5',
  'circuit-glow-strength': '1',

  /* 3D backgrounds */
  'grid3d-speed': '1',
  'grid3d-depth': '1',

  /* Hex grid */
  'hexgrid-speed': '1',
  'hexgrid-density': '1',
  'hexgrid-tilt': '1',

  /* Particle field */
  'particles-speed': '1',
  'particles-density': '1',
  'particles-size': '1',

  /* Nebula */
  'nebula-speed': '1',
  'nebula-size': '1',
  'nebula-blur': '1',

  /* Scanlines */
  'scanlines-speed': '1',
  'scanlines-density': '1',
  'scanlines-beam': '1',

  /* Star field */
  'starfield-speed': '1',
  'starfield-density': '1',
  'starfield-twinkle': '1',

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
  grid3d: { id: 'grid3d', labelEn: '3D Grid Horizon', labelAr: 'شبكة أفقية 3D' },
  grid3d_tunnel: { id: 'grid3d_tunnel', labelEn: '3D Warp Tunnel', labelAr: 'نفق 3D' },
  grid3d_canyon: { id: 'grid3d_canyon', labelEn: '3D Grid Canyon', labelAr: 'وادٍ شبكي 3D' },
  grid3d_rings: { id: 'grid3d_rings', labelEn: '3D Orbital Rings', labelAr: 'حلقات مدارية 3D' },
  none: { id: 'none', labelEn: 'Solid Only', labelAr: 'لون صلب فقط' },
};

export function isGrid3DBackground(type = '') {
  return type === 'grid3d' || type.startsWith('grid3d_');
}

/** Settings preserved when switching color presets */
export const APPEARANCE_THEME_KEYS = [
  'color-mode',
  'glows-enabled',
  'surfaces-opacity-enabled',
  'surfaces-opacity',
  'surfaces-style',
  'surfaces-glass-blur',
  'background-type',
  'aurora-enabled',
  'aurora-responsive',
  'aurora-amplitude',
  'aurora-speed',
  'aurora-blend',
  'aurora-intensity',
  'aurora-height',
  'bg-effect-opacity',
  'circuit-speed',
  'circuit-pulse-speed',
  'circuit-density',
  'circuit-pulses',
  'circuit-glow-strength',
  'grid3d-speed',
  'grid3d-depth',
  'hexgrid-speed',
  'hexgrid-density',
  'hexgrid-tilt',
  'particles-speed',
  'particles-density',
  'particles-size',
  'nebula-speed',
  'nebula-size',
  'nebula-blur',
  'scanlines-speed',
  'scanlines-density',
  'scanlines-beam',
  'starfield-speed',
  'starfield-density',
  'starfield-twinkle',
  'logo-url',
  'logo-core-color',
  'logo-bg-color',
  'logo-bg-enabled',
  'logo-filter-auto',
  'logo-hue-rotate',
  'logo-glow',
  'logo-saturate',
  'logo-brightness',
  'logo-zoom',
  'logo-pos-x',
  'logo-pos-y',
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
  sunset: {
    id: 'sunset',
    labelEn: 'Sunset Glow',
    labelAr: 'توهج الغروب',
    overrides: {
      'bg-primary': '#120806',
      'bg-surface': '#1e1008',
      'bg-elevated': '#2c1810',
      'text-primary': '#fff1eb',
      'text-secondary': '#c4a090',
      'text-muted': '#8a7068',
      accent: '#f97316',
      'accent-hover': '#fb923c',
      'accent-dark': '#9a3412',
      border: '#4a2818',
      'border-strong': '#6b3820',
    },
  },
  slate: {
    id: 'slate',
    labelEn: 'Slate Pro',
    labelAr: 'أردوازي احترافي',
    overrides: {
      'bg-primary': '#0a0e14',
      'bg-surface': '#121820',
      'bg-elevated': '#1a2430',
      'text-primary': '#e8edf4',
      'text-secondary': '#9aa8b8',
      'text-muted': '#64748b',
      accent: '#64748b',
      'accent-hover': '#94a3b8',
      'accent-dark': '#334155',
      border: '#1e293b',
      'border-strong': '#475569',
    },
  },
  neon: {
    id: 'neon',
    labelEn: 'Neon Pink',
    labelAr: 'وردي نيون',
    overrides: {
      'bg-primary': '#0c040c',
      'bg-surface': '#160818',
      'bg-elevated': '#220c24',
      'text-primary': '#fce7ff',
      'text-secondary': '#c4a0c8',
      'text-muted': '#8a6a90',
      accent: '#e879f9',
      'accent-hover': '#f0abfc',
      'accent-dark': '#86198f',
      border: '#3d1840',
      'border-strong': '#5c2458',
    },
  },
  indigo: {
    id: 'indigo',
    labelEn: 'Deep Indigo',
    labelAr: 'نيلي عميق',
    overrides: {
      'bg-primary': '#050510',
      'bg-surface': '#0a0a1e',
      'bg-elevated': '#12122e',
      'text-primary': '#e8e8fc',
      'text-secondary': '#a0a0c8',
      'text-muted': '#6a6a98',
      accent: '#6366f1',
      'accent-hover': '#818cf8',
      'accent-dark': '#3730a3',
      border: '#1e1e4a',
      'border-strong': '#312e81',
    },
  },
  copper: {
    id: 'copper',
    labelEn: 'Copper Forge',
    labelAr: 'نحاسي مصهور',
    overrides: {
      'bg-primary': '#0c0806',
      'bg-surface': '#18100a',
      'bg-elevated': '#241810',
      'text-primary': '#faf0e8',
      'text-secondary': '#c4a890',
      'text-muted': '#8a7868',
      accent: '#d97706',
      'accent-hover': '#f59e0b',
      'accent-dark': '#92400e',
      border: '#3d2810',
      'border-strong': '#5c3818',
    },
  },
  arctic: {
    id: 'arctic',
    labelEn: 'Arctic Ice',
    labelAr: 'جليد قطبي',
    overrides: {
      'bg-primary': '#060c14',
      'bg-surface': '#0a1624',
      'bg-elevated': '#102030',
      'text-primary': '#f0f8ff',
      'text-secondary': '#a0c4e0',
      'text-muted': '#6898b8',
      accent: '#38bdf8',
      'accent-hover': '#7dd3fc',
      'accent-dark': '#0369a1',
      border: '#1a3a50',
      'border-strong': '#0c4a6e',
    },
  },
  toxic: {
    id: 'toxic',
    labelEn: 'Toxic Lime',
    labelAr: 'ليموني سام',
    overrides: {
      'bg-primary': '#060c04',
      'bg-surface': '#0a1808',
      'bg-elevated': '#10240c',
      'text-primary': '#f0fce8',
      'text-secondary': '#a0c888',
      'text-muted': '#6a9858',
      accent: '#84cc16',
      'accent-hover': '#a3e635',
      'accent-dark': '#3f6212',
      border: '#1a4010',
      'border-strong': '#365314',
    },
  },
  dusk: {
    id: 'dusk',
    labelEn: 'Twilight Dusk',
    labelAr: 'شفق الغسق',
    overrides: {
      'bg-primary': '#080610',
      'bg-surface': '#100c1c',
      'bg-elevated': '#181428',
      'text-primary': '#ede8fc',
      'text-secondary': '#a8a0c4',
      'text-muted': '#706a88',
      accent: '#8b5cf6',
      'accent-hover': '#a78bfa',
      'accent-dark': '#5b21b6',
      border: '#2a2040',
      'border-strong': '#4c3570',
    },
  },
};

export const LIGHT_THEME_PRESETS = {
  daylight: {
    id: 'daylight',
    labelEn: 'Daylight',
    labelAr: 'نهاري',
    overrides: {
      'bg-primary': '#f1f5f9',
      'bg-surface': '#ffffff',
      'bg-elevated': '#e8edf4',
      'text-primary': '#0f172a',
      'text-secondary': '#475569',
      'text-muted': '#94a3b8',
      accent: '#0284c7',
      'accent-hover': '#0ea5e9',
      'accent-dark': '#0369a1',
      border: '#e2e8f0',
      'border-strong': '#cbd5e1',
      'sale-badge-text': '#ffffff',
    },
  },
  cloud: {
    id: 'cloud',
    labelEn: 'Cloud White',
    labelAr: 'سحابي أبيض',
    overrides: {
      'bg-primary': '#f8fafc',
      'bg-surface': '#ffffff',
      'bg-elevated': '#f1f5f9',
      'text-primary': '#1e293b',
      'text-secondary': '#64748b',
      'text-muted': '#94a3b8',
      accent: '#3b82f6',
      'accent-hover': '#60a5fa',
      'accent-dark': '#1d4ed8',
      border: '#e2e8f0',
      'border-strong': '#cbd5e1',
      'sale-badge-text': '#ffffff',
    },
  },
  paper: {
    id: 'paper',
    labelEn: 'Warm Paper',
    labelAr: 'ورقي دافئ',
    overrides: {
      'bg-primary': '#faf8f5',
      'bg-surface': '#fffdf9',
      'bg-elevated': '#f5f0e8',
      'text-primary': '#292524',
      'text-secondary': '#78716c',
      'text-muted': '#a8a29e',
      accent: '#d97706',
      'accent-hover': '#f59e0b',
      'accent-dark': '#b45309',
      border: '#e7e5e4',
      'border-strong': '#d6d3d1',
      'sale-badge-text': '#ffffff',
    },
  },
  lavender: {
    id: 'lavender',
    labelEn: 'Soft Lavender',
    labelAr: 'لافندر ناعم',
    overrides: {
      'bg-primary': '#f5f3ff',
      'bg-surface': '#ffffff',
      'bg-elevated': '#ede9fe',
      'text-primary': '#1e1b4b',
      'text-secondary': '#6b7280',
      'text-muted': '#9ca3af',
      accent: '#7c3aed',
      'accent-hover': '#8b5cf6',
      'accent-dark': '#5b21b6',
      border: '#e9e5ff',
      'border-strong': '#ddd6fe',
      'sale-badge-text': '#ffffff',
    },
  },
  mintLight: {
    id: 'mintLight',
    labelEn: 'Fresh Mint',
    labelAr: 'نعناع منعش',
    overrides: {
      'bg-primary': '#f0fdf9',
      'bg-surface': '#ffffff',
      'bg-elevated': '#ccfbf1',
      'text-primary': '#134e4a',
      'text-secondary': '#5f6f6c',
      'text-muted': '#94a3a0',
      accent: '#0d9488',
      'accent-hover': '#14b8a6',
      'accent-dark': '#0f766e',
      border: '#d1fae5',
      'border-strong': '#a7f3d0',
      'sale-badge-text': '#ffffff',
    },
  },
  roseLight: {
    id: 'roseLight',
    labelEn: 'Blush Rose',
    labelAr: 'وردي فاتح',
    overrides: {
      'bg-primary': '#fff5f7',
      'bg-surface': '#ffffff',
      'bg-elevated': '#ffe4e8',
      'text-primary': '#4c0519',
      'text-secondary': '#9f7280',
      'text-muted': '#b89aa4',
      accent: '#e11d48',
      'accent-hover': '#f43f5e',
      'accent-dark': '#be123c',
      border: '#fecdd3',
      'border-strong': '#fda4af',
      'sale-badge-text': '#ffffff',
    },
  },
  sand: {
    id: 'sand',
    labelEn: 'Desert Sand',
    labelAr: 'رملي صحراوي',
    overrides: {
      'bg-primary': '#faf6f0',
      'bg-surface': '#fffcf7',
      'bg-elevated': '#f3ebe0',
      'text-primary': '#3d3428',
      'text-secondary': '#8a7d6e',
      'text-muted': '#b0a494',
      accent: '#b45309',
      'accent-hover': '#d97706',
      'accent-dark': '#92400e',
      border: '#e8dfd0',
      'border-strong': '#d6c8b4',
      'sale-badge-text': '#ffffff',
    },
  },
  sky: {
    id: 'sky',
    labelEn: 'Open Sky',
    labelAr: 'سماء مفتوحة',
    overrides: {
      'bg-primary': '#eff6ff',
      'bg-surface': '#ffffff',
      'bg-elevated': '#dbeafe',
      'text-primary': '#1e3a5f',
      'text-secondary': '#5b7a9d',
      'text-muted': '#8aa4be',
      accent: '#2563eb',
      'accent-hover': '#3b82f6',
      'accent-dark': '#1d4ed8',
      border: '#bfdbfe',
      'border-strong': '#93c5fd',
      'sale-badge-text': '#ffffff',
    },
  },
};

export function isLightColorMode(overrides = {}) {
  return (overrides['color-mode'] || DEFAULT_THEME['color-mode']) === 'light';
}

export function getPresetsForMode(mode = 'dark') {
  return mode === 'light' ? LIGHT_THEME_PRESETS : THEME_PRESETS;
}

export function getDefaultPresetForMode(mode = 'dark') {
  return mode === 'light' ? LIGHT_THEME_PRESETS.daylight : THEME_PRESETS.cyber;
}

const DERIVED_THEME_KEYS = new Set([
  'logo-bg',
  'logo-bg-hover',
  'logo-border',
  'logo-translate-x',
  'logo-translate-y',
  'bg-header',
  'gradient-accent',
  'gradient-surface',
  'shadow-glow',
  'shadow-card',
]);

export function getColorPresetOverrides(overrides = {}) {
  const normalized = normalizeThemeOverrides(overrides);
  const skip = new Set([...APPEARANCE_THEME_KEYS, ...DERIVED_THEME_KEYS]);
  return Object.fromEntries(
    Object.entries(normalized).filter(([key]) => !skip.has(key)),
  );
}

export function getPresetPreviewColors(preset, mode = 'dark') {
  const full = buildFullTheme({ ...preset.overrides, 'color-mode': mode });
  return {
    bgPrimary: full['bg-primary'],
    bgSurface: full['bg-surface'],
    accent: full.accent,
    accentHover: full['accent-hover'],
    textPrimary: full['text-primary'],
  };
}

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
  const hue = max === r
    ? ((g - b) / delta + (g < b ? 6 : 0)) / 6
    : max === g
      ? ((b - r) / delta + 2) / 6
      : ((r - g) / delta + 4) / 6;

  return hue * 360;
}

function normalizeHueDelta(degrees) {
  let delta = degrees;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  return delta;
}

export function getEffectiveLogoCoreColor(overrides = {}, accent = null) {
  const custom = overrides['logo-core-color']?.trim();
  if (custom?.startsWith('#')) return custom.slice(0, 7);
  const resolvedAccent = accent || overrides.accent || DEFAULT_THEME.accent;
  return resolvedAccent?.startsWith('#') ? resolvedAccent.slice(0, 7) : '#22d3ee';
}

export function isLogoCoreColorDefault(overrides = {}) {
  return !overrides['logo-core-color']?.trim();
}

export function getEffectiveLogoBgColor(overrides = {}, context = {}) {
  const custom = overrides['logo-bg-color']?.trim();
  if (custom?.startsWith('#')) return custom.slice(0, 7);

  const accent = context.accent || overrides.accent || DEFAULT_THEME.accent;
  if (isLightColorMode(overrides)) {
    const darkBase = context['accent-dark'] || overrides['accent-dark'] || DEFAULT_THEME['accent-dark'];
    return blendHex(darkBase?.startsWith('#') ? darkBase : '#0f172a', accent, 0.86);
  }

  const elevated = context['bg-elevated'] || overrides['bg-elevated'] || DEFAULT_THEME['bg-elevated'];
  return blendHex(elevated, accent, 0.92);
}

export function isLogoBgColorDefault(overrides = {}) {
  return !overrides['logo-bg-color']?.trim();
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

export function parseLogoPosition(value, fallback = 50) {
  const match = String(value || '').match(/(-?\d+(?:\.\d+)?)/);
  const parsed = match ? Number(match[1]) : fallback;
  return Math.min(100, Math.max(0, parsed));
}

export const LOGO_POSITION_RANGE = 45;

export function deriveLogoTranslate(posX = 50, posY = 50, range = LOGO_POSITION_RANGE) {
  const tx = ((posX - 50) / 50) * range;
  const ty = ((posY - 50) / 50) * range;
  return {
    'logo-translate-x': `${tx.toFixed(2)}%`,
    'logo-translate-y': `${ty.toFixed(2)}%`,
  };
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
  const lightMode = isLightColorMode(overrides);
  const glowsEnabled = (overrides['glows-enabled'] ?? base['glows-enabled'] ?? 'true') !== 'false';

  if (!overrides['bg-header'] && base['bg-primary']?.startsWith('#')) {
    base['bg-header'] = hexToRgba(base['bg-primary'], lightMode ? 0.88 : 0.92);
  }

  if (!overrides['gradient-accent']) {
    base['gradient-accent'] = `linear-gradient(to right, ${accent}, ${lightMode ? base['accent-hover'] || accent : '#3b82f6'})`;
  }

  if (!overrides['gradient-surface']) {
    base['gradient-surface'] = `linear-gradient(to bottom, ${base['bg-surface']}, ${base['bg-primary']})`;
  }

  if (!overrides['shadow-glow']) {
    base['shadow-glow'] = glowsEnabled ? accentGlow(accent) : 'none';
  }

  if (!overrides['shadow-card']) {
    base['shadow-card'] = lightMode
      ? '0 1px 2px rgba(15, 23, 42, 0.04), 0 8px 24px -8px rgba(15, 23, 42, 0.09)'
      : DEFAULT_THEME['shadow-card'];
  }

  deriveTextColors(base, overrides);
  deriveSaleColors(base, overrides, accent);
  deriveGamesColors(base, overrides, accent);

  const logoAuto = (overrides['logo-filter-auto'] ?? base['logo-filter-auto'] ?? 'true') !== 'false';
  if (logoAuto) {
    const logoTint = getEffectiveLogoCoreColor(overrides, accent);
    Object.assign(base, deriveLogoFilter(logoTint));
  }

  for (const key of ['logo-hue-rotate', 'logo-glow', 'logo-saturate', 'logo-brightness', 'logo-zoom', 'logo-pos-x', 'logo-pos-y']) {
    if (!base[key]) base[key] = DEFAULT_THEME[key];
  }

  const posX = parseLogoPosition(base['logo-pos-x'], 50);
  const posY = parseLogoPosition(base['logo-pos-y'], 50);
  base['logo-pos-x'] = String(posX);
  base['logo-pos-y'] = String(posY);
  Object.assign(base, deriveLogoTranslate(posX, posY));

  if (!glowsEnabled) {
    base['shadow-glow'] = 'none';
    base['logo-glow'] = 'transparent';
    base['dash-stat-glow'] = 'transparent';
  }

  const logoBgEnabled = (overrides['logo-bg-enabled'] ?? base['logo-bg-enabled'] ?? 'true') !== 'false';
  const customLogoBg = overrides['logo-bg-color']?.trim();
  if (!logoBgEnabled) {
    base['logo-bg'] = 'transparent';
    base['logo-bg-hover'] = 'transparent';
    base['logo-border'] = 'transparent';
  } else if (customLogoBg?.startsWith('#')) {
    const bg = customLogoBg.slice(0, 7);
    base['logo-bg'] = bg;
    base['logo-bg-hover'] = blendHex(bg, accent, 0.78);
    base['logo-border'] = blendHex(bg, accent, 0.48);
  } else if (!overrides['logo-bg']) {
    if (lightMode) {
      const darkBase = base['accent-dark']?.startsWith('#') ? base['accent-dark'] : '#0f172a';
      base['logo-bg'] = `color-mix(in srgb, ${darkBase} 86%, var(--accent))`;
      base['logo-bg-hover'] = `color-mix(in srgb, ${darkBase} 78%, var(--accent))`;
      base['logo-border'] = `color-mix(in srgb, ${darkBase} 68%, var(--accent))`;
    } else {
      base['logo-bg'] = DEFAULT_THEME['logo-bg'];
      base['logo-bg-hover'] = DEFAULT_THEME['logo-bg-hover'];
      base['logo-border'] = DEFAULT_THEME['logo-border'];
    }
  }

  deriveGlassTextTokens(base, lightMode);
  deriveSurfaceStyle(base, overrides, lightMode);

  return base;
}

export function resolveSurfacesStyle(overrides = {}, base = {}) {
  const explicit = overrides['surfaces-style'] ?? base['surfaces-style'];
  if (explicit && explicit !== 'solid') return explicit;
  if (explicit === 'solid') return 'solid';

  const enabled = (overrides['surfaces-opacity-enabled'] ?? base['surfaces-opacity-enabled'] ?? 'false') !== 'false';
  return enabled ? 'transparent' : 'solid';
}

function deriveGlassTextTokens(base, lightMode = false) {
  const primary = base['text-primary'] || DEFAULT_THEME['text-primary'];
  const secondary = base['text-secondary'] || DEFAULT_THEME['text-secondary'];
  const muted = base['text-muted'] || DEFAULT_THEME['text-muted'];

  base['glass-text-primary'] = primary;
  if (lightMode) {
    base['glass-text-secondary'] = blendHex(secondary, '#1e293b', 0.68);
    base['glass-text-muted'] = blendHex(muted, '#334155', 0.58);
  } else {
    base['glass-text-secondary'] = blendHex(primary, secondary, 0.4);
    base['glass-text-muted'] = blendHex(primary, muted, 0.52);
  }
}

function deriveSurfaceStyle(base, overrides, lightMode = false) {
  const style = resolveSurfacesStyle(overrides, base);
  base['surfaces-style'] = style;

  const rawOpacity = parseFloat(base['surfaces-opacity'] ?? '0.88');
  const opacity = Math.min(1, Math.max(0.25, Number.isFinite(rawOpacity) ? rawOpacity : 0.88));
  base['surfaces-opacity'] = String(Number(opacity.toFixed(2)));

  const rawBlur = parseFloat(base['surfaces-glass-blur'] ?? '24');
  const blurPx = Math.min(32, Math.max(12, Number.isFinite(rawBlur) ? rawBlur : 24));
  base['surfaces-glass-blur'] = String(Math.round(blurPx));
  base['surfaces-glass-fill'] = String(Number(Math.min(0.88, Math.max(0.55, opacity * 0.82)).toFixed(2)));
  base['glass-blur'] = `${Math.round(blurPx)}px`;
  base['glass-fill'] = String(Math.round(parseFloat(base['surfaces-glass-fill']) * 100));

  if (style === 'solid') return;

  const toTranslucent = (color, alpha = opacity) => {
    if (!color) return color;
    if (color.startsWith('#')) return hexToRgba(color.slice(0, 7), alpha);
    return `color-mix(in srgb, ${color} ${Math.round(alpha * 100)}%, transparent)`;
  };

  const surface = base['bg-surface'];
  const elevated = base['bg-elevated'];

  // Frosted cards use CSS glass-panel (bg-header tint) — do not mutate surface tokens.
  if (style === 'transparent') {
    if (surface) base['bg-surface'] = toTranslucent(surface);
    if (elevated) base['bg-elevated'] = toTranslucent(elevated);

    const header = base['bg-header'];
    if (header?.startsWith('#')) {
      base['bg-header'] = hexToRgba(header.slice(0, 7), opacity);
    } else if (header?.startsWith('rgba')) {
      base['bg-header'] = `color-mix(in srgb, ${header} ${Math.round(opacity * 100)}%, transparent)`;
    } else if (base['bg-primary']?.startsWith('#')) {
      base['bg-header'] = hexToRgba(base['bg-primary'], opacity * (lightMode ? 0.88 : 0.92));
    }

    if (surface) {
      base['dash-card-bg'] = toTranslucent(surface, Math.min(1, opacity * 0.92));
    }
  } else if (surface) {
    base['dash-card-bg'] = `color-mix(in srgb, var(--bg-header) ${base['glass-fill']}%, transparent)`;
  }
}

const STRIP_THEME_KEYS = new Set([]);

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
  root.setAttribute('data-color-mode', theme['color-mode'] || 'dark');
  root.setAttribute(
    'data-glows-enabled',
    (clean['glows-enabled'] ?? theme['glows-enabled'] ?? 'true') !== 'false' ? 'true' : 'false',
  );
  root.setAttribute('data-background-type', theme['background-type'] || 'aurora');
  root.setAttribute(
    'data-logo-bg-enabled',
    (clean['logo-bg-enabled'] ?? theme['logo-bg-enabled'] ?? 'true') !== 'false' ? 'true' : 'false',
  );
  const surfacesStyle = resolveSurfacesStyle(clean, theme);
  root.setAttribute('data-surfaces-style', surfacesStyle);
  root.setAttribute(
    'data-surfaces-opacity-enabled',
    surfacesStyle !== 'solid' ? 'true' : 'false',
  );

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

function presetMatchesColor(preset, colorOverrides, mode = 'dark') {
  const presetEntries = Object.entries(preset.overrides);
  const colorEntries = Object.entries(colorOverrides);

  if (preset.id === 'cyber' || preset.id === 'daylight') {
    if (colorEntries.length === 0) return true;
    const full = buildFullTheme({ ...preset.overrides, 'color-mode': mode });
    return colorEntries.every(([key, val]) => full[key] === val);
  }

  return presetEntries.length > 0
    && presetEntries.every(([key, val]) => colorOverrides[key] === val)
    && colorEntries.length === presetEntries.length;
}

export function detectPresetId(overrides = {}) {
  const colorOverrides = getColorPresetOverrides(overrides);
  const mode = overrides['color-mode'] || DEFAULT_THEME['color-mode'];
  const presets = getPresetsForMode(mode);
  const defaultId = mode === 'light' ? 'daylight' : 'cyber';

  if (Object.keys(colorOverrides).length === 0) {
    return defaultId;
  }

  for (const preset of Object.values(presets)) {
    if (preset.id === defaultId) continue;
    if (presetMatchesColor(preset, colorOverrides, mode)) {
      return preset.id;
    }
  }

  if (presetMatchesColor(presets[defaultId], colorOverrides, mode)) {
    return defaultId;
  }

  return 'custom';
}