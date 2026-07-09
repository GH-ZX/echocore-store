export function sortGamesByCarousel(games = []) {
  return [...games].sort((a, b) => {
    const ao = a.carousel_order ?? 999999;
    const bo = b.carousel_order ?? 999999;
    if (ao !== bo) return ao - bo;
    return new Date(a.created_at) - new Date(b.created_at);
  });
}

const CAROUSEL_FALLBACK_LIMIT = 12;

import { isStorefrontGame } from './gameRegions';

export function getCarouselGames(games = []) {
  const sorted = sortGamesByCarousel(games.filter(isStorefrontGame));
  const explicit = sorted.filter((g) => g.show_in_carousel === true);
  if (explicit.length > 0) return explicit;

  return sorted
    .filter((g) =>
      g.active !== false
      && g.redemption_method !== 'redeem_code'
      && (g.image_url || g.logo_url))
    .slice(0, CAROUSEL_FALLBACK_LIMIT);
}