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

export function getGameOfferPath(offer, game) {
  const gameSlug = getGameSlug(game);
  return `/game/${gameSlug}/${getOfferSlug(offer)}`;
}

export function getGameOfferBuyPath(offer, game) {
  return `${getGameOfferPath(offer, game)}/buy`;
}

export function resolveGameFromParams(games, gameSlug) {
  if (!gameSlug) return null;
  return games.find((g) => (g.slug || g.id) === gameSlug)
    || games.find((g) => g.id === gameSlug)
    || null;
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
  const game = resolveGameFromParams(games, gameSlug);
  const token = offerSlug || id || offerId;

  if (game && token) {
    const inGame = resolveOfferFromParams(offers, token, game.id);
    if (inGame) return { offer: inGame, game };
  }

  const offer = resolveOfferFromParams(offers, token);
  if (!offer) return { offer: null, game: null };

  const resolvedGame = games.find((g) => g.id === offer.game_id) || game || null;
  return { offer, game: resolvedGame };
}