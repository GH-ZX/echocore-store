import {
  normalizeRegionLabel,
  parseG2BulkGameMeta,
} from './regionMeta';

export { normalizeRegionLabel, parseG2BulkGameMeta } from './regionMeta';

function slugifyBaseKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';
}

export function getGameBaseMeta(game) {
  if (!game) return { baseKey: '', baseName: '', regionLabel: 'Global' };
  return parseG2BulkGameMeta(game.g2bulk_game_code || game.slug || '', game.name_en || game.name_ar || '');
}

function isVoucherLike(game) {
  return !!game && game.redemption_method === 'redeem_code';
}

export function isStorefrontGame(game) {
  return !!game && !game.parent_game_id;
}

function isCanonicalParent(game) {
  return !!game && isStorefrontGame(game) && !game.g2bulk_game_code;
}

function normalizeBaseKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveBaseKey(game) {
  if (!game) return '';
  const raw = game.group_base_key
    || getGameBaseMeta(game).baseKey
    || game.slug
    || '';
  return normalizeBaseKey(raw);
}

function enrichVariant(game) {
  return {
    ...game,
    region_label: game.region_label || getGameBaseMeta(game).regionLabel,
  };
}

function sortVariants(variants = []) {
  return [...variants].sort((a, b) => String(a.region_label || '').localeCompare(String(b.region_label || '')));
}

function findCanonicalParent(games = [], gameOrBaseKey) {
  const baseKey = normalizeBaseKey(
    typeof gameOrBaseKey === 'string'
      ? gameOrBaseKey
      : resolveBaseKey(gameOrBaseKey),
  );
  if (!baseKey) return null;

  const parentSlug = slugifyBaseKey(baseKey);
  return games.find((row) => isCanonicalParent(row) && row.slug === parentSlug)
    || games.find((row) => isCanonicalParent(row) && resolveBaseKey(row) === baseKey)
    || null;
}

function dedupeRegionalTopupGames(games = []) {
  const active = games.filter((game) => game && game.active !== false);
  const childCodes = new Set(
    active.filter((game) => game.parent_game_id && game.g2bulk_game_code)
      .map((game) => game.g2bulk_game_code),
  );

  const byBase = new Map();
  active.forEach((game) => {
    if (!isStorefrontGame(game)) return;
    if (isVoucherLike(game)) return;
    if (game.g2bulk_game_code && childCodes.has(game.g2bulk_game_code)) return;

    const meta = getGameBaseMeta(game);
    const key = meta.baseKey || `solo:${game.id}`;
    const storefrontRow = {
      ...game,
      slug: meta.baseKey ? slugifyBaseKey(meta.baseKey) : game.slug,
      name_en: meta.baseName || game.name_en,
      name_ar: meta.baseName || game.name_ar,
      group_base_key: meta.baseKey || game.group_base_key,
    };

    if (!byBase.has(key)) {
      byBase.set(key, storefrontRow);
      return;
    }

    const existing = byBase.get(key);
    const preferred = isCanonicalParent(game) && !isCanonicalParent(existing) ? storefrontRow : existing;
    byBase.set(key, preferred);
  });

  return [...byBase.values()];
}

/** Top-up games only — one card per title (Valorant, PUBG, …), regions live on the detail page. */
export function getStorefrontGames(games = []) {
  return dedupeRegionalTopupGames(games);
}

/** Voucher parents (gift cards + gaming accounts) — separate from game top-ups. */
export function getStorefrontVoucherGames(games = []) {
  return games.filter((game) =>
    game
    && game.active !== false
    && isStorefrontGame(game)
    && isVoucherLike(game));
}

export function getAllStorefrontProducts(games = []) {
  return [...getStorefrontGames(games), ...getStorefrontVoucherGames(games)];
}

export function variantHasActiveOffers(variant, offers = []) {
  if (!variant?.id) return false;
  return offers.some((offer) => offer.game_id === variant.id && offer.active !== false);
}

export function getRegionVariantsWithOffers(games = [], parentOrId, offers = []) {
  return getRegionVariants(games, parentOrId)
    .filter((variant) => variantHasActiveOffers(variant, offers));
}

export function storefrontGameHasOffers(game, games = [], offers = []) {
  if (!game) return false;
  const childIds = getChildGameIds(games, game);
  return childIds.some((id) => offers.some((offer) => offer.game_id === id && offer.active !== false));
}

export function getRegionVariants(games = [], parentOrId) {
  const parent = typeof parentOrId === 'object' ? parentOrId : games.find((game) => game.id === parentOrId);
  const parentId = parent?.id;
  if (!parentId) return [];

  const directChildren = games
    .filter((game) => game.parent_game_id === parentId && game.active !== false)
    .map(enrichVariant);
  if (directChildren.length > 0) return sortVariants(directChildren);

  const baseKey = resolveBaseKey(parent);
  if (!baseKey) return [];

  const canonicalParent = findCanonicalParent(games, baseKey);
  if (canonicalParent && canonicalParent.id !== parentId) {
    const canonicalChildren = games
      .filter((game) => game.parent_game_id === canonicalParent.id && game.active !== false)
      .map(enrichVariant);
    if (canonicalChildren.length > 0) return sortVariants(canonicalChildren);
  }

  const keyedChildren = games
    .filter((game) => game.active !== false && game.g2bulk_game_code)
    .filter((game) => resolveBaseKey(game) === baseKey)
    .map(enrichVariant);
  if (keyedChildren.length > 0) return sortVariants(keyedChildren);

  const legacyRegionalParents = games
    .filter((game) => game.active !== false && isStorefrontGame(game) && game.g2bulk_game_code)
    .filter((game) => resolveBaseKey(game) === baseKey)
    .map(enrichVariant);
  return sortVariants(legacyRegionalParents);
}

export function buildChildToParentMap(games = []) {
  const map = new Map();
  games.forEach((game) => {
    if (game.parent_game_id) map.set(game.id, game.parent_game_id);
  });
  return map;
}

export function getChildGameIds(games = [], game) {
  if (!game) return [];
  if (game.parent_game_id) return [game.id];

  const children = getRegionVariants(games, game.id);
  if (children.length > 0) return children.map((child) => child.id);
  return [game.id];
}

export function resolveStorefrontGame(games = [], gameOrSlug) {
  if (!gameOrSlug) return null;

  const game = typeof gameOrSlug === 'string'
    ? games.find((row) => (row.slug || row.id) === gameOrSlug || row.id === gameOrSlug)
    : gameOrSlug;

  if (!game) return null;

  if (game.parent_game_id) {
    const linkedParent = games.find((row) => row.id === game.parent_game_id);
    if (linkedParent) {
      return getStorefrontGames(games).find((row) => row.id === linkedParent.id)
        || linkedParent;
    }
  }

  if (isVoucherLike(game) && isStorefrontGame(game)) {
    return game;
  }

  const meta = getGameBaseMeta(game);
  const canonicalParent = findCanonicalParent(games, meta.baseKey);
  if (canonicalParent) {
    return getStorefrontGames(games).find((row) => row.id === canonicalParent.id)
      || canonicalParent;
  }

  const storefront = getStorefrontGames(games);
  const grouped = storefront.find((row) => row.group_base_key === meta.baseKey
    || row.slug === slugifyBaseKey(meta.baseKey)
    || row.id === game.id);
  return grouped || game;
}

export function getDisplayGameForOffer(offer, games = []) {
  if (!offer) return null;
  const fulfillment = games.find((game) => game.id === offer.game_id);
  if (!fulfillment) return null;
  if (fulfillment.parent_game_id) {
    return games.find((game) => game.id === fulfillment.parent_game_id) || fulfillment;
  }
  return fulfillment;
}

export function getFulfillmentGameForOffer(offer, games = []) {
  if (!offer) return null;
  return games.find((game) => game.id === offer.game_id) || null;
}

export function offerBelongsToStorefront(offer, games = [], storefrontIds = null) {
  if (!offer) return false;
  const ids = storefrontIds || new Set(getAllStorefrontProducts(games).map((game) => game.id));
  if (ids.has(offer.game_id)) return true;

  const childToParent = buildChildToParentMap(games);
  const parentId = childToParent.get(offer.game_id);
  return !!(parentId && ids.has(parentId));
}

export function regionParamSlug(label = '') {
  return String(label)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'global';
}

export function findVariantByRegionParam(variants = [], regionParam = '') {
  if (!regionParam || variants.length === 0) return null;
  const normalized = String(regionParam).trim().toLowerCase();
  return variants.find((variant) => regionParamSlug(variant.region_label) === normalized)
    || variants.find((variant) => String(variant.region_label || '').toLowerCase() === normalized)
    || null;
}

export function pickDefaultVariant(variants = [], offers = []) {
  if (!variants.length) return null;

  const withOffers = variants.filter((variant) => variantHasActiveOffers(variant, offers));
  if (!withOffers.length) return null;

  return withOffers.find((variant) => variant.region_label === 'Global')
    || withOffers[0];
}