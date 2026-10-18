import { presetImageUrl } from './imageUtils';

function normalizeImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  try {
    const parsed = new URL(trimmed);
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return trimmed.split('?')[0].toLowerCase();
  }
}

/** Full cover / hero — carousel slides and game page header */
export function getGameCoverUrl(game) {
  return game?.image_url || null;
}

export function hasDistinctGameLogo(game) {
  const logo = game?.logo_url;
  if (!logo) return false;
  const cover = game?.image_url;
  if (!cover) return true;
  return normalizeImageUrl(logo) !== normalizeImageUrl(cover);
}

/**
 * Mini logo when an admin uploaded one separately; otherwise the cover.
 * Catalog sync also copies the square supplier art into logo_url
 * (logo_custom = false) — that must not shadow a wide cover on the card.
 */
export function getGameCardImageUrl(game) {
  if (hasDistinctGameLogo(game) && game?.logo_custom !== false) return game.logo_url;
  return game?.image_url || null;
}

export function dedupeGameLogoAgainstCover(logoUrl, coverUrl) {
  if (!logoUrl || !coverUrl) return logoUrl || null;
  return normalizeImageUrl(logoUrl) === normalizeImageUrl(coverUrl) ? null : logoUrl;
}

export function presetGameCardImage(url) {
  if (!url) return null;
  return presetImageUrl(url, 'cardCover');
}

export function presetGameCoverImage(url, preset = 'heroCover') {
  if (!url) return null;
  return presetImageUrl(url, preset);
}