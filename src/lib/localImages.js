/**
 * Supplier artwork mirrored on our own domain as small WebP files
 * (public/game-thumbs/<name>.webp, ~25 KB instead of ~300 KB PNGs).
 * Keeps the supplier host out of customer pages and avoids its CORS errors.
 * Add a name here after dropping a new file into public/game-thumbs/.
 */
const SUPPLIER_IMAGE = /^https?:\/\/api\.g2bulk\.com\/images\/([^/?#]+)\.(png|jpe?g|webp)(?:[?#].*)?$/i;

export const LOCAL_GAME_THUMBS = new Set([
  '1000041588',
  'arena_breakout',
  'arena_breakout_infinite',
  'arknights_endfield',
  'bloodstrike',
  'bloodstrikeme',
  'cat_discord',
  'cat_razer_giftcards',
  'deltaforce',
  'freefire_eu',
  'freefire_me',
  'genshin',
  'hok',
  'honkai_star_rail',
  'jawaker',
  'kingshot',
  'lds',
  'magic_chess_gogo',
  'marvelrivals',
  'mlbb',
  'mlbb_exclusive',
  'mlbb_global',
  'mlbb_special',
  'mlbb_tr',
  'nte',
  'oncehuman',
  'playstation_plus',
  'pubgm',
  'roblox_giftcard',
  'rsm',
  'starmaker',
  'telegram',
  'wuwa',
  'zzz',
]);

const BASE = (import.meta.env?.BASE_URL || '/').replace(/\/?$/, '/');

// Our own static art saved in the DB with the production domain
// (https://www.echocore412.com/game-covers/…) — serve it from the current
// origin so local dev and preview builds show the same files.
const OWN_STATIC_ART = /^https?:\/\/(?:www\.)?echocore412\.com\/((?:game-covers|game-logos|game-thumbs)\/[^?#]+)/i;

/** Supplier image URL → our local WebP copy when we have one; anything else unchanged. */
export function localizeImageUrl(url) {
  if (!url || typeof url !== 'string') return url;
  const own = url.match(OWN_STATIC_ART);
  if (own) return `${BASE}${own[1]}`;
  const match = url.match(SUPPLIER_IMAGE);
  if (!match) return url;
  const name = match[1].toLowerCase();
  return LOCAL_GAME_THUMBS.has(name) ? `${BASE}game-thumbs/${name}.webp` : url;
}
