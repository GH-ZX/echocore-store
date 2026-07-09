import { presetImageUrl } from './imageUtils';

const colorCache = new Map();

function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  return { s, l };
}

function boostRgb(r, g, b) {
  const mx = Math.max(r, g, b);
  const factor = mx > 20 ? Math.min(255 / mx, 1.85) : 1;
  return {
    r: Math.min(255, Math.round(r * factor)),
    g: Math.min(255, Math.round(g * factor)),
    b: Math.min(255, Math.round(b * factor)),
  };
}

/** URLs we can read with canvas when crossOrigin=anonymous (Supabase, same-origin, blob/data). */
export function isCanvasSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (url.startsWith('data:') || url.startsWith('blob:')) return true;

  try {
    const parsed = new URL(url, window.location.origin);
    if (parsed.origin === window.location.origin) return true;
    if (parsed.hostname.endsWith('.supabase.co')) return true;
  } catch {
    return false;
  }

  return false;
}

/** External logos (e.g. G2Bulk) need a CORS-enabled proxy for pixel sampling. */
function corsReadableSampleUrl(url) {
  return `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=64&h=64&fit=inside&we&output=png`;
}

function buildSampleUrlList(url) {
  if (!url) return [];

  const candidates = [
    presetImageUrl(url, 'colorSample'),
    url,
  ];

  if (!isCanvasSafeUrl(url)) {
    candidates.push(corsReadableSampleUrl(url));
  }

  return [...new Set(candidates.filter(Boolean))];
}

function loadImageForSampling(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';

    const finish = (result) => {
      img.onload = null;
      img.onerror = null;
      resolve(result);
    };

    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/** Pull a vibrant brand color from a loaded logo image (canvas-safe). */
export function extractDominantLogoColor(img) {
  if (!img?.naturalWidth) return null;

  try {
    const size = 48;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    let rSum = 0;
    let gSum = 0;
    let bSum = 0;
    let weight = 0;
    let rFallback = 0;
    let gFallback = 0;
    let bFallback = 0;
    let wFallback = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      if (alpha < 0.1) continue;

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const { s, l } = rgbToHsl(r, g, b);

      rFallback += r * alpha;
      gFallback += g * alpha;
      bFallback += b * alpha;
      wFallback += alpha;

      if (s < 0.12 || l < 0.06 || l > 0.94) continue;

      const w = alpha * (0.35 + s * 1.4) * (1 - Math.abs(l - 0.45) * 0.35);
      rSum += r * w;
      gSum += g * w;
      bSum += b * w;
      weight += w;
    }

    const useVibrant = weight > 2;
    const divisor = useVibrant ? weight : wFallback;
    if (divisor < 0.5) return null;

    const boosted = boostRgb(
      (useVibrant ? rSum : rFallback) / divisor,
      (useVibrant ? gSum : gFallback) / divisor,
      (useVibrant ? bSum : bFallback) / divisor,
    );

    return `rgb(${boosted.r}, ${boosted.g}, ${boosted.b})`;
  } catch {
    return null;
  }
}

/** Sample logo accent from URL; tries direct CORS then a readable proxy for external hosts. */
export async function sampleLogoColorFromUrl(url) {
  if (!url) return null;
  if (colorCache.has(url)) return colorCache.get(url);

  const sampleUrls = buildSampleUrlList(url);

  for (const sampleUrl of sampleUrls) {
    const img = await loadImageForSampling(sampleUrl);
    if (!img) continue;

    const color = extractDominantLogoColor(img);
    if (color) {
      colorCache.set(url, color);
      return color;
    }
  }

  return null;
}