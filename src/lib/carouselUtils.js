import { isStorefrontGame } from './gameRegions';
export { resolveCarouselLogo, g2bulkGameImageUrl } from './carouselLogos';

export function sortGamesByCarousel(games = []) {
  return [...games].sort((a, b) => {
    const ao = a.carousel_order ?? 999999;
    const bo = b.carousel_order ?? 999999;
    if (ao !== bo) return ao - bo;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

const CAROUSEL_FALLBACK_LIMIT = 12;

export function isCarouselRedeemItem(game) {
  return !!game && game.redemption_method === 'redeem_code';
}

/** Active storefront titles eligible for carousel (top-up games + redeem codes). */
export function getCarouselEligibleGames(games = []) {
  return games.filter((game) =>
    isStorefrontGame(game)
    && game.active !== false
    && (game.image_url || game.logo_url),
  );
}

export function getCarouselGames(games = []) {
  const sorted = sortGamesByCarousel(games.filter(isStorefrontGame));
  const explicit = sorted.filter((g) => g.show_in_carousel === true);
  if (explicit.length > 0) return explicit;

  // Default fallback: top-up games only (legacy behaviour when nothing pinned)
  return sorted
    .filter((g) =>
      g.active !== false
      && !isCarouselRedeemItem(g)
      && (g.image_url || g.logo_url))
    .slice(0, CAROUSEL_FALLBACK_LIMIT);
}

/**
 * Store titles not already on the carousel (games + redeem codes).
 * @param {object[]} games
 * @param {{ kind?: 'all'|'games'|'redeem' }} [opts]
 */
export function getCarouselPickableGames(games = [], { kind = 'all' } = {}) {
  const eligible = getCarouselEligibleGames(games);
  const inCarouselIds = new Set(getCarouselGames(games).map((game) => game.id));

  let list = eligible.filter((game) =>
    !inCarouselIds.has(game.id)
    && (game.image_url || game.logo_url),
  );

  if (kind === 'games') {
    list = list.filter((game) => !isCarouselRedeemItem(game));
  } else if (kind === 'redeem') {
    list = list.filter((game) => isCarouselRedeemItem(game));
  }

  return sortGamesByCarousel(list);
}

/** Games + redeem codes eligible for carousel management UI */
export function getCarouselManageableGames(games = []) {
  return sortGamesByCarousel(getCarouselEligibleGames(games));
}
