export function normalizePullSelection(raw = {}) {
  const syncKeys = Array.isArray(raw.topupSyncBaseKeys)
    ? raw.topupSyncBaseKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const liveKeys = Array.isArray(raw.topupLiveBaseKeys)
    ? raw.topupLiveBaseKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];
  const legacyKeys = Array.isArray(raw.topupBaseKeys)
    ? raw.topupBaseKeys.map((value) => String(value).trim()).filter(Boolean)
    : [];

  const topupSyncBaseKeys = syncKeys.length > 0 || liveKeys.length > 0
    ? syncKeys
    : legacyKeys;
  const topupLiveBaseKeys = liveKeys;
  const topupBaseKeys = [...new Set([...topupSyncBaseKeys, ...topupLiveBaseKeys])];

  return {
    topupSyncBaseKeys,
    topupLiveBaseKeys,
    topupBaseKeys,
    accountCategoryIds: Array.isArray(raw.accountCategoryIds)
      ? raw.accountCategoryIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [],
    giftCategoryIds: Array.isArray(raw.giftCategoryIds)
      ? raw.giftCategoryIds.map((value) => Number(value)).filter((value) => Number.isFinite(value))
      : [],
    carouselBaseKeys: Array.isArray(raw.carouselBaseKeys)
      ? raw.carouselBaseKeys.map((value) => String(value).trim()).filter(Boolean)
      : [],
  };
}

export function countPullSelection(pull = {}, { includeGiftCards = true } = {}) {
  const normalized = normalizePullSelection(pull);
  const games = normalized.topupBaseKeys.length;
  const accounts = normalized.accountCategoryIds.length;
  const giftCards = includeGiftCards ? normalized.giftCategoryIds.length : 0;
  return {
    ...normalized,
    total: games + accounts + giftCards,
    games,
    accounts,
    giftCards,
    syncGames: normalized.topupSyncBaseKeys.length,
    liveGames: normalized.topupLiveBaseKeys.length,
  };
}

export function hasPullSelection(pull = {}, { includeGiftCards = true } = {}) {
  return countPullSelection(pull, { includeGiftCards }).total > 0;
}

function parentMatchesTopupKey(game, keySet) {
  if (!game || keySet.size === 0) return false;
  const slug = String(game.slug || '').trim();
  const baseKey = String(game.group_base_key || '').trim();
  return keySet.has(slug) || keySet.has(baseKey);
}

export function filterGamesByPullSelection(games = [], pull = {}) {
  const normalized = normalizePullSelection(pull);
  const selectedTopup = new Set(normalized.topupBaseKeys);
  const accountIds = new Set(normalized.accountCategoryIds);
  const giftIds = new Set(normalized.giftCategoryIds);

  if (selectedTopup.size === 0 && accountIds.size === 0 && giftIds.size === 0) {
    return games;
  }

  const parentIds = new Set();
  games.forEach((game) => {
    if (game.parent_game_id) return;
    if (game.redemption_method === 'uid' && parentMatchesTopupKey(game, selectedTopup)) {
      parentIds.add(game.id);
    }
    if (game.redemption_method === 'redeem_code') {
      const sourceId = Number(game.g2bulk_source_id);
      if (accountIds.has(sourceId) || giftIds.has(sourceId)) {
        parentIds.add(game.id);
      }
    }
    if (game.group_base_key && selectedTopup.has(game.group_base_key)) {
      parentIds.add(game.id);
    }
  });

  return games.filter((game) => {
    if (game.catalog_source === 'live') {
      const baseKey = String(game.group_base_key || game.slug || '').trim();
      return selectedTopup.has(baseKey);
    }
    if (game.parent_game_id) {
      return parentIds.has(game.parent_game_id);
    }
    if (game.redemption_method === 'uid') {
      return parentIds.has(game.id);
    }
    if (game.redemption_method === 'redeem_code') {
      const sourceId = Number(game.g2bulk_source_id);
      return accountIds.has(sourceId) || giftIds.has(sourceId);
    }
    return true;
  });
}

export function filterOffersByPullSelection(offers = [], games = [], pull = {}) {
  const allowedGameIds = new Set(filterGamesByPullSelection(games, pull).map((game) => game.id));
  const normalized = normalizePullSelection(pull);
  if (
    normalized.topupBaseKeys.length === 0
    && normalized.accountCategoryIds.length === 0
    && normalized.giftCategoryIds.length === 0
  ) {
    return offers;
  }
  return offers.filter((offer) => allowedGameIds.has(offer.game_id));
}

export function isEmptyPullSelection(pull = {}) {
  const normalized = normalizePullSelection(pull);
  return normalized.topupBaseKeys.length === 0
    && normalized.accountCategoryIds.length === 0
    && normalized.giftCategoryIds.length === 0;
}

export function mergePullSelections(saved = {}, database = {}) {
  const savedNorm = normalizePullSelection(saved);
  const dbNorm = normalizePullSelection(database);
  if (isEmptyPullSelection(savedNorm)) return dbNorm;

  return normalizePullSelection({
    topupSyncBaseKeys: [...new Set([...savedNorm.topupSyncBaseKeys, ...dbNorm.topupSyncBaseKeys])],
    topupLiveBaseKeys: [...new Set([...savedNorm.topupLiveBaseKeys, ...dbNorm.topupLiveBaseKeys])],
    accountCategoryIds: [...new Set([...savedNorm.accountCategoryIds, ...dbNorm.accountCategoryIds])],
    giftCategoryIds: [...new Set([...savedNorm.giftCategoryIds, ...dbNorm.giftCategoryIds])],
    carouselBaseKeys: savedNorm.carouselBaseKeys.length > 0
      ? savedNorm.carouselBaseKeys
      : dbNorm.carouselBaseKeys,
  });
}

function slugifyPullKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'game';
}

function slugifyUnderscoreKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'game';
}

export function buildCatalogKeyIndex(games = []) {
  const keyToCanonical = new Map();
  for (const game of games) {
    const baseKey = String(game.baseKey || '').trim();
    if (!baseKey) continue;
    const aliases = [
      baseKey,
      baseKey.toLowerCase(),
      slugifyPullKey(baseKey),
      slugifyUnderscoreKey(baseKey),
    ];
    aliases.forEach((alias) => {
      if (alias) keyToCanonical.set(alias, baseKey);
    });
  }
  return keyToCanonical;
}

export function resolveCatalogBaseKey(key, index) {
  const raw = String(key || '').trim();
  if (!raw) return raw;
  return index.get(raw)
    || index.get(raw.toLowerCase())
    || index.get(slugifyPullKey(raw))
    || index.get(slugifyUnderscoreKey(raw))
    || raw;
}

export function alignSelectionSetsToCatalog(selection, catalog = {}) {
  const index = buildCatalogKeyIndex(catalog.games || []);
  const alignKey = (value) => resolveCatalogBaseKey(value, index);
  const alignSet = (set) => new Set([...set].map(alignKey).filter(Boolean));

  return {
    topupSyncBaseKeys: alignSet(selection.topupSyncBaseKeys),
    topupLiveBaseKeys: alignSet(selection.topupLiveBaseKeys),
    accountCategoryIds: new Set(selection.accountCategoryIds),
    giftCategoryIds: new Set(selection.giftCategoryIds),
    carouselBaseKeys: alignSet(selection.carouselBaseKeys),
  };
}

export function selectionSetsFromPayload(payload = {}, catalog = null) {
  const normalized = normalizePullSelection(payload);
  const sets = {
    topupSyncBaseKeys: new Set(normalized.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(normalized.topupLiveBaseKeys),
    accountCategoryIds: new Set(normalized.accountCategoryIds),
    giftCategoryIds: new Set(normalized.giftCategoryIds),
    carouselBaseKeys: new Set(normalized.carouselBaseKeys),
  };
  if (catalog) return alignSelectionSetsToCatalog(sets, catalog);
  return sets;
}

export function selectionPayloadFromSets(selection) {
  return {
    topupSyncBaseKeys: [...selection.topupSyncBaseKeys],
    topupLiveBaseKeys: [...selection.topupLiveBaseKeys],
    topupBaseKeys: [...new Set([...selection.topupSyncBaseKeys, ...selection.topupLiveBaseKeys])],
    accountCategoryIds: [...selection.accountCategoryIds],
    giftCategoryIds: [...selection.giftCategoryIds],
    carouselBaseKeys: [...selection.carouselBaseKeys],
  };
}

/** Ensure catalog rows already in the store appear selected in the pull panel */
export function applySyncedCatalogToSelection(catalog = {}, selection) {
  const next = {
    topupSyncBaseKeys: new Set(selection.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(selection.topupLiveBaseKeys),
    accountCategoryIds: new Set(selection.accountCategoryIds),
    giftCategoryIds: new Set(selection.giftCategoryIds),
    carouselBaseKeys: new Set(selection.carouselBaseKeys),
  };

  (catalog.games || []).forEach((item) => {
    if (!item?.synced || !item.baseKey) return;
    const key = String(item.baseKey).trim();
    if (!next.topupSyncBaseKeys.has(key) && !next.topupLiveBaseKeys.has(key)) {
      next.topupSyncBaseKeys.add(key);
    }
  });

  (catalog.accounts || []).forEach((item) => {
    if (!item?.synced || item.categoryId == null) return;
    next.accountCategoryIds.add(Number(item.categoryId));
  });

  (catalog.giftCards || []).forEach((item) => {
    if (!item?.synced || item.categoryId == null) return;
    next.giftCategoryIds.add(Number(item.categoryId));
  });

  return next;
}

export function filterLiveCatalog(catalog = {}, pull = {}) {
  const normalized = normalizePullSelection(pull);
  const liveKeys = new Set(normalized.topupLiveBaseKeys);
  const accountIds = new Set(normalized.accountCategoryIds);
  const giftIds = new Set(normalized.giftCategoryIds);

  const games = (catalog.games || []).filter((game) => {
    if (game.group_base_key && liveKeys.has(game.group_base_key)) return true;
    if (game.catalog_source === 'live' && game.redemption_method === 'redeem_code') {
      const sourceId = Number(game.g2bulk_source_id);
      return accountIds.has(sourceId) || giftIds.has(sourceId);
    }
    return false;
  });

  const gameIds = new Set(games.map((game) => game.id));
  const offers = (catalog.offers || []).filter((offer) => gameIds.has(offer.game_id));

  return { games, offers };
}