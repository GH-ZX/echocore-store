/**
 * Curated font presets for the admin font changer.
 * All four are clean modern Arabic+Latin type families. Each ships on Google Fonts,
 * so the loader can lazily inject a `<link>` to fonts.googleapis.com the first time
 * a non-default font is chosen — the default Cairo is already preloaded in index.html.
 *
 * Adding a new font family here must also update `loadFontFamily()` so the stylesheet
 * gets fetched on demand. Keep the list short (4–6) — the admin already has full CSS
 * control via `--font-sans` if they want a custom self-hosted font.
 */

export const FONT_PRESETS = [
  {
    id: 'cairo',
    labelEn: 'Cairo',
    labelAr: 'القاهرة',
    stack: "'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 600, 800, 900],
    // Already in index.html; no dynamic load needed.
    googleId: null,
  },
  {
    id: 'tajawal',
    labelEn: 'Tajawal',
    labelAr: 'تجوال',
    stack: "'Tajawal', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 500, 700, 800],
    googleId: 'Tajawal',
  },
  {
    id: 'almarai',
    labelEn: 'Almarai',
    labelAr: 'المرعى',
    stack: "'Almarai', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [300, 400, 700, 800],
    googleId: 'Almarai',
  },
  {
    id: 'readex-pro',
    labelEn: 'Readex Pro',
    labelAr: 'ريديكس برو',
    stack: "'Readex Pro', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    googleId: 'Readex+Pro',
  },
  {
    id: 'ibm-plex-arabic',
    labelEn: 'IBM Plex Arabic',
    labelAr: 'IBM بلكسي عربي',
    stack: "'IBM Plex Sans Arabic', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    googleId: 'IBM+Plex+Sans+Arabic:wght@400..700',
  },
  {
    id: 'noto-sans-arabic',
    labelEn: 'Noto Sans Arabic',
    labelAr: 'نوتو سانس عربي',
    stack: "'Noto Sans Arabic', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    googleId: 'Noto+Sans+Arabic:wght@400..700',
  },
  {
    id: 'noto-kufi-arabic',
    labelEn: 'Noto Kufi Arabic',
    labelAr: 'نوتو كوفي عربي',
    stack: "'Noto Kufi Arabic', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    googleId: 'Noto+Kufi+Arabic:wght@400..700',
  },
  {
    id: 'el-messiri',
    labelEn: 'El Messiri',
    labelAr: 'المسيري',
    stack: "'El Messiri', 'Cairo', ui-sans-serif, system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    googleId: 'El+Messiri:wght@400..700',
  },
];

/** Find a preset by id, or null. */
export function findFontPreset(id) {
  return FONT_PRESETS.find((preset) => preset.id === id) || null;
}

/** Find a preset by CSS stack (used when restoring persisted `--font-sans`). */
export function findFontPresetByStack(stack) {
  return FONT_PRESETS.find((preset) => preset.stack === stack) || null;
}

const injectedIds = new Set();

/**
 * Lazily inject the Google Fonts stylesheet for a preset the first time it's requested.
 * Cairo (default) is already preloaded from index.html, so it's skipped.
 *
 * Handles two `googleId` shapes:
 *   - bare family: 'Tajawal'            → weights come from the `weights` arg
 *   - with range:  'Noto+Sans+Arabic:wght@400..700' → use as-is, ignore weights
 *
 * @param {string} googleId
 * @param {number[]} weights
 */
export function loadFontFamily(googleId, weights = [400, 600, 800]) {
  if (!googleId || injectedIds.has(googleId)) return;
  if (typeof document === 'undefined') return;
  injectedIds.add(googleId);

  const familyPart = googleId.includes(':wght@')
    ? googleId
    : `${googleId}:wght@${weights.join(';')}`;
  const href = `https://fonts.googleapis.com/css2?family=${familyPart}&display=swap`;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.fontLoader = googleId;
  document.head.appendChild(link);
}

/** Ensure the preset's Google Fonts stylesheet is loaded (idempotent). */
export function ensureFontLoaded(preset) {
  if (!preset || !preset.googleId) return;
  loadFontFamily(preset.googleId, preset.weights);
}