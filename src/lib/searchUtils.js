import { getAllStorefrontProducts, getDisplayGameForOffer, offerBelongsToStorefront } from './gameRegions';

export function normalizeSearchTerm(value = '') {
  return String(value).trim().toLowerCase();
}

export function filterGamesByQuery(games = [], query = '') {
  const term = normalizeSearchTerm(query);
  const storefront = getAllStorefrontProducts(games);
  if (!term) return storefront;

  return storefront.filter((game) => {
    const haystack = [
      game.name_en,
      game.name_ar,
      game.slug,
      game.points_name,
      game.description_en,
      game.description_ar,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}

export function filterOffersByQuery(offers = [], games = [], query = '') {
  const term = normalizeSearchTerm(query);
  const scoped = offers.filter((offer) => offerBelongsToStorefront(offer, games));
  if (!term) return scoped;

  return scoped.filter((offer) => {
    const game = getDisplayGameForOffer(offer, games);
    const haystack = [
      offer.name_en,
      offer.name_ar,
      offer.region,
      game?.name_en,
      game?.name_ar,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(term);
  });
}