/**
 * Built-in wallpaper presets for the StoreBackground "wallpaper" mode.
 * Each preset is a tileable, dark, cyber-flavored SVG encoded as a data URI so it ships
 * in the bundle (no network/rate-limit, no Supabase fetch). The admin can one-click pick
 * from the gallery or upload their own (always wins if set).
 *
 * Keep this list short and curated — 4–5 options max. Every preset must:
 *   - be 1200×800 (or larger) so it covers a phone→desktop without seam
 *   - tint with the accent (uses #8b5cf6 / #a78bfa) so the wallpaper visually belongs to
 *     the active theme palette, not a competing hue
 *   - stay low-contrast so foreground content reads cleanly without a heavy scrim
 */

const svg = (markup) => `data:image/svg+xml;utf8,${encodeURIComponent(markup).replace(/'/g, '%27')}`;

const TECH_GRID_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
  <rect width='1200' height='800' fill='#07030f'/>
  <g stroke='#8b5cf6' fill='none' stroke-linecap='round'>
    <path d='M-200 800 L600 240 L1400 800' stroke-opacity='0.35' stroke-width='1.5'/>
    <path d='M-100 800 L600 300 L1300 800' stroke-opacity='0.25' stroke-width='1'/>
    <path d='M0 800 L600 360 L1200 800' stroke-opacity='0.18' stroke-width='1'/>
    <path d='M-350 800 L600 180 L1550 800' stroke-opacity='0.18' stroke-width='1'/>
    <path d='M0 500 H1200' stroke-opacity='0.12'/>
    <path d='M0 600 H1200' stroke-opacity='0.18'/>
    <path d='M0 700 H1200' stroke-opacity='0.28'/>
  </g>
  <circle cx='600' cy='240' r='5' fill='#a78bfa' fill-opacity='0.9'/>
  <circle cx='600' cy='240' r='14' fill='#a78bfa' fill-opacity='0.25'/>
</svg>`.trim();

const AURORA_SWEEP_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <linearGradient id='aur-band' x1='0' y1='0' x2='0' y2='1'>
      <stop offset='0' stop-color='#8b5cf6' stop-opacity='0.55'/>
      <stop offset='0.45' stop-color='#8b5cf6' stop-opacity='0.18'/>
      <stop offset='1' stop-color='#07030f' stop-opacity='0'/>
    </linearGradient>
    <radialGradient id='aur-glow' cx='0.45' cy='-0.05' r='0.9'>
      <stop offset='0' stop-color='#c084fc' stop-opacity='0.7'/>
      <stop offset='0.6' stop-color='#a78bfa' stop-opacity='0.18'/>
      <stop offset='1' stop-color='#a78bfa' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <rect width='1200' height='800' fill='#07030f'/>
  <rect x='-50' y='-100' width='1300' height='780' fill='url(#aur-glow)' opacity='0.85'/>
  <rect x='0' y='0' width='1200' height='520' fill='url(#aur-band)'/>
</svg>`.trim();

const DOT_FIELD_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <pattern id='dots-grid' x='0' y='0' width='36' height='36' patternUnits='userSpaceOnUse'>
      <circle cx='18' cy='18' r='1.4' fill='#8b5cf6' fill-opacity='0.4'/>
    </pattern>
    <radialGradient id='dots-scrim' cx='0.5' cy='0.5' r='0.7'>
      <stop offset='0' stop-color='#07030f' stop-opacity='0.25'/>
      <stop offset='1' stop-color='#07030f' stop-opacity='0.9'/>
    </radialGradient>
  </defs>
  <rect width='1200' height='800' fill='#080414'/>
  <rect width='1200' height='800' fill='url(#dots-grid)'/>
  <rect width='1200' height='800' fill='url(#dots-scrim)'/>
</svg>`.trim();

const HEX_PATTERN_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
  <defs>
    <pattern id='hex-tiles' x='0' y='0' width='52' height='60' patternUnits='userSpaceOnUse'>
      <polygon points='26,2 50,17 50,45 26,60 2,45 2,17' fill='none' stroke='#8b5cf6' stroke-opacity='0.18' stroke-width='1'/>
    </pattern>
    <radialGradient id='hex-glow' cx='0.5' cy='0.4' r='0.7'>
      <stop offset='0' stop-color='#8b5cf6' stop-opacity='0.18'/>
      <stop offset='1' stop-color='#8b5cf6' stop-opacity='0'/>
    </radialGradient>
  </defs>
  <rect width='1200' height='800' fill='#07030f'/>
  <rect width='1200' height='800' fill='url(#hex-tiles)'/>
  <rect width='1200' height='800' fill='url(#hex-glow)'/>
</svg>`.trim();

const TOPO_SVG = `
<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1200 800' preserveAspectRatio='xMidYMid slice'>
  <rect width='1200' height='800' fill='#07030f'/>
  <g fill='none' stroke='#8b5cf6' stroke-width='1.4'>
    <path d='M0 360 Q300 300 600 360 T1200 360' stroke-opacity='0.28'/>
    <path d='M0 420 Q300 360 600 420 T1200 420' stroke-opacity='0.22'/>
    <path d='M0 480 Q300 420 600 480 T1200 480' stroke-opacity='0.18'/>
    <path d='M0 540 Q300 480 600 540 T1200 540' stroke-opacity='0.14'/>
    <path d='M0 600 Q300 540 600 600 T1200 600' stroke-opacity='0.1'/>
  </g>
  <g fill='none' stroke='#a78bfa' stroke-width='1'>
    <path d='M-50 320 Q300 240 650 320 T1250 320' stroke-opacity='0.18'/>
    <path d='M-50 260 Q300 180 650 260 T1250 260' stroke-opacity='0.12'/>
  </g>
</svg>`.trim();

export const WALLPAPER_PRESETS = [
  {
    id: 'tech-grid',
    labelEn: 'Cyber Horizon',
    labelAr: 'أفق سايبر',
    src: svg(TECH_GRID_SVG),
  },
  {
    id: 'aurora-sweep',
    labelEn: 'Aurora Sweep',
    labelAr: 'شفق',
    src: svg(AURORA_SWEEP_SVG),
  },
  {
    id: 'dot-field',
    labelEn: 'Quiet Dots',
    labelAr: 'نقاط هادئة',
    src: svg(DOT_FIELD_SVG),
  },
  {
    id: 'hex-pattern',
    labelEn: 'Subtle Hex',
    labelAr: 'سداسي خفيف',
    src: svg(HEX_PATTERN_SVG),
  },
  {
    id: 'topo-lines',
    labelEn: 'Topographic',
    labelAr: 'خطوط طبوغرافية',
    src: svg(TOPO_SVG),
  },
];

export function findWallpaperPreset(src) {
  return WALLPAPER_PRESETS.find((preset) => preset.src === src) || null;
}