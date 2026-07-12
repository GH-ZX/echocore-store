import { VOUCHER_UI_TAGS, classifyVoucherSegment } from './catalogSegments';

function normalizeIdList(raw, key) {
  return Array.isArray(raw[key])
    ? raw[key].map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
}

function normalizeKeyList(raw, key) {
  return Array.isArray(raw[key])
    ? raw[key].map((value) => String(value).trim()).filter(Boolean)
    : [];
}

function normalizeCategoryIdSplit(raw, syncKey, liveKey, legacyKey) {
  const syncIds = normalizeIdList(raw, syncKey);
  const liveIds = normalizeIdList(raw, liveKey);
  const legacyIds = normalizeIdList(raw, legacyKey);
  const syncCategoryIds = syncIds.length > 0 || liveIds.length > 0 ? syncIds : legacyIds;
  const liveCategoryIds = liveIds;
  const categoryIds = [...new Set([...syncCategoryIds, ...liveCategoryIds])];
  return { syncCategoryIds, liveCategoryIds, categoryIds };
}

export function getVoucherCategoryId(game) {
  const fromSource = Number(game?.g2bulk_source_id);
  if (Number.isFinite(fromSource)) return fromSource;
  const fromCategory = Number(game?.g2bulk_category_id);
  if (Number.isFinite(fromCategory)) return fromCategory;
  const liveId = String(game?.id || '');
  if (liveId.startsWith('live:voucher:')) {
    const categoryId = Number(liveId.split(':')[2]);
    if (Number.isFinite(categoryId)) return categoryId;
  }
  return null;
}

function voucherMatchesCategorySets(game, accountIds, giftIds) {
  const categoryId = getVoucherCategoryId(game);
  if (!Number.isFinite(categoryId)) return false;
  const uiSegment = classifyVoucherSegment(game.name_en || game.name_ar || game.slug || '');
  if (uiSegment === VOUCHER_UI_TAGS.gamingAccount) return accountIds.has(categoryId);
  return giftIds.has(categoryId);
}

export function normalizePullSelection(raw = {}) {
  const syncKeys = normalizeKeyList(raw, 'topupSyncBaseKeys');
  const liveKeys = normalizeKeyList(raw, 'topupLiveBaseKeys');
  const legacyKeys = normalizeKeyList(raw, 'topupBaseKeys');

  const topupSyncBaseKeys = syncKeys.length > 0 || liveKeys.length > 0 ? syncKeys : legacyKeys;
  const topupLiveBaseKeys = liveKeys;
  const topupBaseKeys = [...new Set([...topupSyncBaseKeys, ...topupLiveBaseKeys])];

  const accountSplit = normalizeCategoryIdSplit(
    raw,
    'accountSyncCategoryIds',
    'accountLiveCategoryIds',
    'accountCategoryIds',
  );
  const giftSplit = normalizeCategoryIdSplit(
    raw,
    'giftSyncCategoryIds',
    'giftLiveCategoryIds',
    'giftCategoryIds',
  );

  return {
    topupSyncBaseKeys,
    topupLiveBaseKeys,
    topupBaseKeys,
    accountSyncCategoryIds: accountSplit.syncCategoryIds,
    accountLiveCategoryIds: accountSplit.liveCategoryIds,
    accountCategoryIds: accountSplit.categoryIds,
    giftSyncCategoryIds: giftSplit.syncCategoryIds,
    giftLiveCategoryIds: giftSplit.liveCategoryIds,
    giftCategoryIds: giftSplit.categoryIds,
    carouselBaseKeys: normalizeKeyList(raw, 'carouselBaseKeys'),
  };
}

export function countPullSelection(pull = {}, { includeGiftCards = true } = {}) {
  const normalized = normalizePullSelection(pull);
  const games = normalized.topupBaseKeys.length;
  const accounts = normalized.accountCategoryIds.length;
  const giftCards = includeGiftCards ? normalized.giftCategoryIds.length : 0;
  const vouchers = accounts + giftCards;
  return {
    ...normalized,
    total: games + vouchers,
    games,
    accounts,
    giftCards,
    vouchers,
    platformVouchers: accounts,
    gameVouchers: giftCards,
    syncGames: normalized.topupSyncBaseKeys.length,
    liveGames: normalized.topupLiveBaseKeys.length,
    syncAccounts: normalized.accountSyncCategoryIds.length,
    liveAccounts: normalized.accountLiveCategoryIds.length,
    syncGiftCards: normalized.giftSyncCategoryIds.length,
    liveGiftCards: normalized.giftLiveCategoryIds.length,
    syncVouchers: normalized.accountSyncCategoryIds.length
      + (includeGiftCards ? normalized.giftSyncCategoryIds.length : 0),
    liveVouchers: normalized.accountLiveCategoryIds.length
      + (includeGiftCards ? normalized.giftLiveCategoryIds.length : 0),
    syncPlatformVouchers: normalized.accountSyncCategoryIds.length,
    livePlatformVouchers: normalized.accountLiveCategoryIds.length,
    syncGameVouchers: includeGiftCards ? normalized.giftSyncCategoryIds.length : 0,
    liveGameVouchers: includeGiftCards ? normalized.giftLiveCategoryIds.length : 0,
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
      if (voucherMatchesCategorySets(game, accountIds, giftIds)) {
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
      if (baseKey && normalized.topupLiveBaseKeys.includes(baseKey)) return true;
      if (game.redemption_method === 'redeem_code') {
        return voucherMatchesCategorySets(
          game,
          new Set(normalized.accountLiveCategoryIds),
          new Set(normalized.giftLiveCategoryIds),
        );
      }
      return false;
    }
    if (game.parent_game_id) {
      return parentIds.has(game.parent_game_id);
    }
    if (game.redemption_method === 'uid') {
      return parentIds.has(game.id);
    }
    if (game.redemption_method === 'redeem_code') {
      return voucherMatchesCategorySets(
        game,
        new Set(normalized.accountSyncCategoryIds),
        new Set(normalized.giftSyncCategoryIds),
      );
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
    accountSyncCategoryIds: [...new Set([...savedNorm.accountSyncCategoryIds, ...dbNorm.accountSyncCategoryIds])],
    accountLiveCategoryIds: [...new Set([...savedNorm.accountLiveCategoryIds, ...dbNorm.accountLiveCategoryIds])],
    giftSyncCategoryIds: [...new Set([...savedNorm.giftSyncCategoryIds, ...dbNorm.giftSyncCategoryIds])],
    giftLiveCategoryIds: [...new Set([...savedNorm.giftLiveCategoryIds, ...dbNorm.giftLiveCategoryIds])],
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
  const alignIdSet = (set) => new Set([...set].map((value) => Number(value)).filter((value) => Number.isFinite(value)));

  return {
    topupSyncBaseKeys: alignSet(selection.topupSyncBaseKeys),
    topupLiveBaseKeys: alignSet(selection.topupLiveBaseKeys),
    accountSyncCategoryIds: alignIdSet(selection.accountSyncCategoryIds),
    accountLiveCategoryIds: alignIdSet(selection.accountLiveCategoryIds),
    giftSyncCategoryIds: alignIdSet(selection.giftSyncCategoryIds),
    giftLiveCategoryIds: alignIdSet(selection.giftLiveCategoryIds),
    carouselBaseKeys: alignSet(selection.carouselBaseKeys),
  };
}

export function selectionSetsFromPayload(payload = {}, catalog = null) {
  const normalized = normalizePullSelection(payload);
  const sets = {
    topupSyncBaseKeys: new Set(normalized.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(normalized.topupLiveBaseKeys),
    accountSyncCategoryIds: new Set(normalized.accountSyncCategoryIds),
    accountLiveCategoryIds: new Set(normalized.accountLiveCategoryIds),
    giftSyncCategoryIds: new Set(normalized.giftSyncCategoryIds),
    giftLiveCategoryIds: new Set(normalized.giftLiveCategoryIds),
    carouselBaseKeys: new Set(normalized.carouselBaseKeys),
  };
  if (catalog) return alignSelectionSetsToCatalog(sets, catalog);
  return sets;
}

export function normalizeCatalogMode(mode) {
  return mode === 'live' ? 'live' : 'sync';
}

export function catalogModeSelectionKeys(catalogMode = 'sync') {
  if (normalizeCatalogMode(catalogMode) === 'live') {
    return {
      topup: 'topupLiveBaseKeys',
      account: 'accountLiveCategoryIds',
      gift: 'giftLiveCategoryIds',
    };
  }
  return {
    topup: 'topupSyncBaseKeys',
    account: 'accountSyncCategoryIds',
    gift: 'giftSyncCategoryIds',
  };
}

/** Persist only the active catalog lane — sync and live are mutually exclusive. */
export function selectionPayloadForCatalogMode(selection, catalogMode = 'sync') {
  const payload = selectionPayloadFromSets(selection);
  const mode = normalizeCatalogMode(catalogMode);

  if (mode === 'live') {
    return {
      ...payload,
      topupSyncBaseKeys: [],
      accountSyncCategoryIds: [],
      giftSyncCategoryIds: [],
      carouselBaseKeys: [],
      topupBaseKeys: [...payload.topupLiveBaseKeys],
      accountCategoryIds: [...payload.accountLiveCategoryIds],
      giftCategoryIds: [...payload.giftLiveCategoryIds],
    };
  }

  return {
    ...payload,
    topupLiveBaseKeys: [],
    accountLiveCategoryIds: [],
    giftLiveCategoryIds: [],
    topupBaseKeys: [...payload.topupSyncBaseKeys],
    accountCategoryIds: [...payload.accountSyncCategoryIds],
    giftCategoryIds: [...payload.giftSyncCategoryIds],
  };
}

export function selectionPayloadFromSets(selection) {
  const accountCategoryIds = [...new Set([
    ...selection.accountSyncCategoryIds,
    ...selection.accountLiveCategoryIds,
  ])];
  const giftCategoryIds = [...new Set([
    ...selection.giftSyncCategoryIds,
    ...selection.giftLiveCategoryIds,
  ])];

  return {
    topupSyncBaseKeys: [...selection.topupSyncBaseKeys],
    topupLiveBaseKeys: [...selection.topupLiveBaseKeys],
    topupBaseKeys: [...new Set([...selection.topupSyncBaseKeys, ...selection.topupLiveBaseKeys])],
    accountSyncCategoryIds: [...selection.accountSyncCategoryIds],
    accountLiveCategoryIds: [...selection.accountLiveCategoryIds],
    accountCategoryIds,
    giftSyncCategoryIds: [...selection.giftSyncCategoryIds],
    giftLiveCategoryIds: [...selection.giftLiveCategoryIds],
    giftCategoryIds,
    carouselBaseKeys: [...selection.carouselBaseKeys],
  };
}

/** Pull selection scoped to synced DB rows only (hybrid mode). */
export function syncedPullSelection(pull = {}) {
  const normalized = normalizePullSelection(pull);
  return {
    ...normalized,
    topupLiveBaseKeys: [],
    topupBaseKeys: normalized.topupSyncBaseKeys,
    accountLiveCategoryIds: [],
    accountCategoryIds: normalized.accountSyncCategoryIds,
    giftLiveCategoryIds: [],
    giftCategoryIds: normalized.giftSyncCategoryIds,
  };
}

/** Ensure catalog rows already in the store appear selected in the pull panel */
export function applySyncedCatalogToSelection(catalog = {}, selection, catalogMode = 'sync') {
  const lane = catalogModeSelectionKeys(catalogMode);
  const next = {
    topupSyncBaseKeys: new Set(selection.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(selection.topupLiveBaseKeys),
    accountSyncCategoryIds: new Set(selection.accountSyncCategoryIds),
    accountLiveCategoryIds: new Set(selection.accountLiveCategoryIds),
    giftSyncCategoryIds: new Set(selection.giftSyncCategoryIds),
    giftLiveCategoryIds: new Set(selection.giftLiveCategoryIds),
    carouselBaseKeys: new Set(selection.carouselBaseKeys),
  };

  (catalog.games || []).forEach((item) => {
    if (!item?.synced || !item.baseKey) return;
    const key = String(item.baseKey).trim();
    if (!next[lane.topup].has(key)) {
      next[lane.topup].add(key);
    }
  });

  (catalog.accounts || []).forEach((item) => {
    if (!item?.synced || item.categoryId == null) return;
    const categoryId = Number(item.categoryId);
    if (!next[lane.account].has(categoryId)) {
      next[lane.account].add(categoryId);
    }
  });

  (catalog.giftCards || []).forEach((item) => {
    if (!item?.synced || item.categoryId == null) return;
    const categoryId = Number(item.categoryId);
    if (!next[lane.gift].has(categoryId)) {
      next[lane.gift].add(categoryId);
    }
  });

  return next;
}

export function filterLiveCatalog(catalog = {}, pull = {}) {
  const normalized = normalizePullSelection(pull);
  const liveKeys = new Set(normalized.topupLiveBaseKeys);
  const liveAccountIds = new Set(normalized.accountLiveCategoryIds);
  const liveGiftIds = new Set(normalized.giftLiveCategoryIds);

  const games = (catalog.games || []).filter((game) => {
    if (game.group_base_key && liveKeys.has(game.group_base_key)) return true;
    if (game.redemption_method === 'redeem_code') {
      return voucherMatchesCategorySets(game, liveAccountIds, liveGiftIds);
    }
    return false;
  });

  const gameIds = new Set(games.map((game) => game.id));
  const offers = (catalog.offers || []).filter((offer) => gameIds.has(offer.game_id));

  return { games, offers };
}