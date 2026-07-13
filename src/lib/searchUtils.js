import {
  getAllStorefrontProducts,
  getDisplayGameForOffer,
  getGameBaseMeta,
  offerBelongsToStorefront,
  resolveStorefrontGame,
} from './gameRegions';
import {
  countActiveOffers,
  getGiftCardGames,
  getVisibleTopupGames,
  isGamingAccountGame,
  isTopupGame,
} from './catalogUtils';

export const SEARCH_FILTER_ALL = 'all';
export const SEARCH_FILTER_TOPUP = 'topup';
export const SEARCH_FILTER_GIFT_CARD = 'gift_card';
export const SEARCH_FILTER_ACCOUNT = 'account';
export const SEARCH_FILTER_OFFERS = 'offers';

const SEARCH_FILTER_VALUES = new Set([
  SEARCH_FILTER_ALL,
  SEARCH_FILTER_TOPUP,
  SEARCH_FILTER_GIFT_CARD,
  SEARCH_FILTER_ACCOUNT,
  SEARCH_FILTER_OFFERS,
]);

export function parseSearchCatalogFilter(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return SEARCH_FILTER_VALUES.has(normalized) ? normalized : SEARCH_FILTER_ALL;
}

export function buildSearchPath({ q = '', type = SEARCH_FILTER_ALL } = {}) {
  const params = new URLSearchParams();
  const trimmed = String(q || '').trim();
  if (trimmed) params.set('q', trimmed);
  const catalogType = parseSearchCatalogFilter(type);
  if (catalogType !== SEARCH_FILTER_ALL) params.set('type', catalogType);
  const qs = params.toString();
  return qs ? `/search?${qs}` : '/search';
}

export function getCatalogSearchQuery(game) {
  if (!game) return '';
  const meta = getGameBaseMeta(game);
  return meta.baseName || game.name_en || game.name_ar || '';
}

/** @deprecated Use getCatalogSearchQuery */
export function getTopupGiftCodeSearchQuery(game) {
  return getCatalogSearchQuery(game);
}

/** Top-up page: gift-code results exist for the same title in global search. */
export function topupHasGiftCardAlternative(topupGame, games = [], offers = []) {
  if (!topupGame || topupGame.redemption_method === 'redeem_code') return false;
  const query = getCatalogSearchQuery(topupGame);
  if (!query.trim()) return false;

  return getGiftCardGames(filterGamesByQuery(games, query))
    .some((game) => game.id !== topupGame.id && countActiveOffers(game.id, offers) > 0);
}

/** Voucher page: direct UID top-up results exist for the same title in global search. */
export function voucherHasTopupAlternative(voucherGame, games = [], offers = []) {
  if (!voucherGame || voucherGame.redemption_method !== 'redeem_code') return false;
  if (isGamingAccountGame(voucherGame)) return false;

  const query = getCatalogSearchQuery(voucherGame);
  if (!query.trim()) return false;

  const matchedIds = new Set(filterTopupGamesByQuery(games, query).map((game) => game.id));
  return getVisibleTopupGames(games, offers)
    .some((game) => game.id !== voucherGame.id && matchedIds.has(game.id));
}

export function normalizeSearchTerm(value = '') {
  return String(value).trim().toLowerCase();
}

function buildGameHaystack(game) {
  return [
    game.name_en,
    game.name_ar,
    game.slug,
    game.points_name,
    game.description_en,
    game.description_ar,
    game.g2bulk_game_code,
    game.region_label,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function matchesSearchTerm(haystack = '', term = '') {
  if (!term) return true;
  if (haystack.includes(term)) return true;

  const tokens = term.split(/\s+/).filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
}

export function filterGamesByQuery(games = [], query = '') {
  const term = normalizeSearchTerm(query);
  const storefront = getAllStorefrontProducts(games);
  if (!term) return storefront;

  const storefrontById = new Map(storefront.map((game) => [game.id, game]));
  const matchedIds = new Set();

  games.forEach((game) => {
    if (game?.active === false) return;
    if (!matchesSearchTerm(buildGameHaystack(game), term)) return;

    const resolved = resolveStorefrontGame(games, game);
    if (resolved?.id && storefrontById.has(resolved.id)) {
      matchedIds.add(resolved.id);
      return;
    }

    if (!game.parent_game_id && storefrontById.has(game.id)) {
      matchedIds.add(game.id);
    }
  });

  return storefront.filter((game) => matchedIds.has(game.id));
}

export function filterTopupGamesByQuery(games = [], query = '') {
  const term = normalizeSearchTerm(query);
  const storefront = getAllStorefrontProducts(games).filter((game) => isTopupGame(game));
  if (!term) return storefront;

  const matched = filterGamesByQuery(games, query);
  const matchedIds = new Set(matched.map((game) => game.id));
  return storefront.filter((game) => matchedIds.has(game.id));
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
      game?.slug,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return matchesSearchTerm(haystack, term);
  });
}