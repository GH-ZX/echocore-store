const SUPABASE_OBJECT_PATH =
  /^(https?:\/\/[^/]+)\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/;

/**
 * Resize/compress Supabase Storage images via the render endpoint.
 * Non-Supabase URLs (placeholders, external CDNs) pass through unchanged.
 */
export function optimizeImageUrl(url, options = {}) {
  if (!url || typeof url !== 'string') return url;
  if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('/render/image/')) {
    return url;
  }

  const match = url.match(SUPABASE_OBJECT_PATH);
  if (!match) return url;

  const [, origin, bucket, objectPath] = match;
  const params = new URLSearchParams();
  const { width, height, quality = 80, resize = 'cover' } = options;

  if (width) params.set('width', String(Math.round(width)));
  if (height) params.set('height', String(Math.round(height)));
  if (quality) params.set('quality', String(Math.round(quality)));
  if (resize) params.set('resize', resize);

  const query = params.toString();
  return `${origin}/storage/v1/render/image/public/${bucket}/${objectPath}${query ? `?${query}` : ''}`;
}

/** Preset sizes tuned for layout slots (not full original uploads). */
export const IMAGE_PRESETS = {
  carouselCover: { width: 1280, quality: 72 },
  carouselLogo: { width: 140, height: 48, quality: 80, resize: 'contain' },
  cardCover: { width: 640, quality: 78 },
  heroCover: { width: 960, quality: 80 },
  colorSample: { width: 48, quality: 60 },
};

export function presetImageUrl(url, preset) {
  const options = IMAGE_PRESETS[preset];
  return options ? optimizeImageUrl(url, options) : url;
}