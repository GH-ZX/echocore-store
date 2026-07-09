import {
  getChildGameIds,
  getDisplayGameForOffer,
  getFulfillmentGameForOffer,
  resolveStorefrontGame,
} from './gameRegions';

export function slugify(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'offer';
}

export function getOfferSlug(offer) {
  if (!offer?.id) return '';
  const name = offer.name_en || offer.name_ar || 'offer';
  return `${slugify(name)}-${String(offer.id).slice(0, 8)}`;
}

export function getGameSlug(game) {
  return game?.slug || game?.id || '';
}

export function getGameOfferPath(offer, gamesOrGame) {
  const games = Array.isArray(gamesOrGame) ? gamesOrGame : [gamesOrGame].filter(Boolean);
  const game = Array.isArray(gamesOrGame)
    ? getDisplayGameForOffer(offer, gamesOrGame)
    : (gamesOrGame || getDisplayGameForOffer(offer, games));
  const gameSlug = getGameSlug(game);
  return `/game/${gameSlug}/${getOfferSlug(offer)}`;
}

export function getGameOfferBuyPath(offer, gamesOrGame) {
  return `${getGameOfferPath(offer, gamesOrGame)}/buy`;
}

export function resolveGameFromParams(games, gameSlug) {
  if (!gameSlug) return null;
  const matched = games.find((g) => (g.slug || g.id) === gameSlug)
    || games.find((g) => g.id === gameSlug)
    || null;
  if (!matched) return null;
  return resolveStorefrontGame(games, matched);
}

export function resolveOfferFromParams(offers, token, gameId = null) {
  if (!token) return null;

  const scoped = gameId ? offers.filter((o) => o.game_id === gameId) : offers;

  const bySlug = scoped.find((o) => getOfferSlug(o) === token);
  if (bySlug) return bySlug;

  const byId = scoped.find((o) => String(o.id) === token);
  if (byId) return byId;

  const suffix = token.length > 9 ? token.slice(-8) : token;
  return scoped.find((o) => String(o.id).startsWith(suffix)) || null;
}

export function resolveOfferRoute(offers, games, { gameSlug, offerSlug, id, offerId }) {
  const storefrontGame = resolveGameFromParams(games, gameSlug);
  const token = offerSlug || id || offerId;
  const scopeIds = storefrontGame ? getChildGameIds(games, storefrontGame) : null;

  if (storefrontGame && token) {
    const scopedOffers = scopeIds
      ? offers.filter((offer) => scopeIds.includes(offer.game_id))
      : offers;
    const inGame = resolveOfferFromParams(scopedOffers, token);
    if (inGame) {
      const fulfillmentGame = getFulfillmentGameForOffer(inGame, games) || storefrontGame;
      return { offer: inGame, game: fulfillmentGame, storefrontGame };
    }
  }

  const offer = resolveOfferFromParams(offers, token);
  if (!offer) return { offer: null, game: null, storefrontGame: null };

  const fulfillmentGame = getFulfillmentGameForOffer(offer, games);
  const displayGame = getDisplayGameForOffer(offer, games) || storefrontGame || fulfillmentGame;
  return {
    offer,
    game: fulfillmentGame || displayGame,
    storefrontGame: displayGame,
  };
}