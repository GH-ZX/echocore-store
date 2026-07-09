import { getChildGameIds } from './gameRegions';

const G2BULK_IMAGE_BASE = 'https://api.g2bulk.com/images';

/** G2Bulk serves square game artwork at /images/{code}.png */
export function g2bulkGameImageUrl(codeOrSlug) {
  const raw = String(codeOrSlug || '').trim().toLowerCase();
  if (!raw) return null;
  const normalized = raw.replace(/-/g, '_');
  return `${G2BULK_IMAGE_BASE}/${normalized}.png`;
}

/**
 * Carousel thumb logo — uses the game's own assets only (no fuzzy name matching).
 * Priority: logo_url → image_url → first child variant → G2Bulk API image by slug/code.
 */
export function resolveCarouselLogo(game, games = []) {
  if (!game) return null;
  if (game.logo_url) return game.logo_url;
  if (game.image_url) return game.image_url;

  const childIds = getChildGameIds(games, game);
  for (const childId of childIds) {
    const child = games.find((row) => row.id === childId);
    if (!child) continue;
    if (child.logo_url) return child.logo_url;
    if (child.image_url) return child.image_url;
    if (child.g2bulk_game_code) return g2bulkGameImageUrl(child.g2bulk_game_code);
  }

  if (game.g2bulk_game_code) return g2bulkGameImageUrl(game.g2bulk_game_code);

  const slugKey = String(game.slug || '').trim();
  if (slugKey) return g2bulkGameImageUrl(slugKey);

  return null;
}