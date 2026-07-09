import {
  getAllStorefrontProducts,
  getDisplayGameForOffer,
  offerBelongsToStorefront,
  resolveStorefrontGame,
} from './gameRegions';
import { isTopupGame } from './catalogUtils';

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