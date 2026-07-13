import { parseG2BulkGameMeta } from './regionMeta';

export { normalizeRegionLabel, parseG2BulkGameMeta } from './regionMeta';

export function getGameBaseMeta(game) {
  if (!game) return { baseKey: '', baseName: '', regionLabel: 'Global' };
  return parseG2BulkGameMeta(game.g2bulk_game_code || game.slug || '', game.name_en || game.name_ar || '');
}

function isVoucherLike(game) {
  return !!game && game.redemption_method === 'redeem_code';
}

/** All games are storefront games (standalone — no parent/child grouping). */
export function isStorefrontGame(game) {
  return !!game;
}

/** Top-up games only — each game is a standalone card (no region deduplication). */
export function getStorefrontGames(games = []) {
  return games.filter((game) =>
    game
    && game.active !== false
    && !isVoucherLike(game)
    && game.redemption_method !== 'redeem_code'
  );
}

/** Voucher games (gift cards + gaming accounts). */
export function getStorefrontVoucherGames(games = []) {
  return games.filter((game) =>
    game
    && game.active !== false
    && isVoucherLike(game)
  );
}

export function getAllStorefrontProducts(games = []) {
  return [...getStorefrontGames(games), ...getStorefrontVoucherGames(games)];
}

export function variantHasActiveOffers(variant, offers = []) {
  if (!variant?.id) return false;
  return offers.some((offer) => offer.game_id === variant.id && offer.active !== false);
}

/** No region variants — each game is standalone. Returns empty. */
export function getRegionVariantsWithOffers(_games = [], _parentOrId, _offers = []) {
  return [];
}

export function storefrontGameHasOffers(game, _games = [], offers = []) {
  if (!game) return false;
  return offers.some((offer) => offer.game_id === game.id && offer.active !== false);
}

/** No region variants — returns empty. */
export function getRegionVariants(_games = [], _parentOrId) {
  return [];
}

export function buildChildToParentMap(_games = []) {
  return new Map();
}

export function getChildGameIds(_games = [], game) {
  if (!game) return [];
  return [game.id];
}

export function resolveStorefrontGame(games = [], gameOrSlug) {
  if (!gameOrSlug) return null;

  const game = typeof gameOrSlug === 'string'
    ? games.find((row) => (row.slug || row.id) === gameOrSlug || row.id === gameOrSlug)
    : gameOrSlug;

  if (!game) return null;
  return game;
}

export function getDisplayGameForOffer(offer, games = []) {
  if (!offer) return null;
  return games.find((game) => game.id === offer.game_id) || null;
}

export function getFulfillmentGameForOffer(offer, games = []) {
  if (!offer) return null;
  return games.find((game) => game.id === offer.game_id) || null;
}

export function offerBelongsToStorefront(offer, games = [], storefrontIds = null) {
  if (!offer) return false;
  const ids = storefrontIds || new Set(getAllStorefrontProducts(games).map((game) => game.id));
  return ids.has(offer.game_id);
}

export function regionParamSlug(label = '') {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'global';
}

export function findVariantByRegionParam(_variants = [], _regionParam = '') {
  return null;
}

export function pickDefaultVariant(_variants = [], _offers = []) {
  return null;
}