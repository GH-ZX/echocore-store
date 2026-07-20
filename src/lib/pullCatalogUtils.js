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

/** Carousel selection key for a top-up game (g2bulk code). */
export function carouselKeyForTopup(code) {
  const key = String(code || '').trim();
  return key || null;
}

/** Carousel selection key for a redeem/voucher category. */
export function carouselKeyForVoucher(categoryId) {
  const id = Number(categoryId);
  if (!Number.isFinite(id)) return null;
  return `voucher:${id}`;
}

/**
 * Parse a carouselBaseKeys entry.
 * @returns {{ kind: 'topup', code: string } | { kind: 'voucher', categoryId: number } | null}
 */
export function parseCarouselKey(key) {
  const raw = String(key || '').trim();
  if (!raw) return null;
  if (raw.startsWith('voucher:')) {
    const categoryId = Number(raw.slice('voucher:'.length));
    if (!Number.isFinite(categoryId)) return null;
    return { kind: 'voucher', categoryId };
  }
  return { kind: 'topup', code: raw };
}

/**
 * Build carouselBaseKeys from live games rows (homepage source of truth).
 * Top-ups → g2bulk_game_code; redeem → voucher:{g2bulk_source_id}
 */
export function buildCarouselBaseKeysFromGames(games = []) {
  const ordered = [...games]
    .filter((game) => game && game.show_in_carousel === true)
    .sort((a, b) => {
      const ao = Number(a.carousel_order);
      const bo = Number(b.carousel_order);
      const aOrd = Number.isFinite(ao) ? ao : 999999;
      const bOrd = Number.isFinite(bo) ? bo : 999999;
      if (aOrd !== bOrd) return aOrd - bOrd;
      return String(a.name_en || a.name_ar || '').localeCompare(String(b.name_en || b.name_ar || ''));
    });

  const keys = [];
  const seen = new Set();
  for (const game of ordered) {
    const key = game.redemption_method === 'redeem_code'
      ? carouselKeyForVoucher(getVoucherCategoryId(game))
      : carouselKeyForTopup(game.g2bulk_game_code);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }
  return keys;
}

/** Prefer live DB carousel keys when merging saved pull selection. */
export function mergePullSelections(saved = {}, database = {}) {
  const savedNorm = normalizePullSelection(saved);
  const dbNorm = normalizePullSelection(database);
  if (isEmptyPullSelection(savedNorm)) {
    return dbNorm;
  }
  // Product lanes stay from saved admin picks; carousel ticks follow live DB flags.
  return normalizePullSelection({
    ...savedNorm,
    carouselBaseKeys: dbNorm.carouselBaseKeys.length > 0
      ? dbNorm.carouselBaseKeys
      : savedNorm.carouselBaseKeys,
  });
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
  const code = String(game.g2bulk_game_code || '').trim();
  return code && keySet.has(code);
}

export function filterGamesByPullSelection(games = [], pull = {}) {
  const normalized = normalizePullSelection(pull);
  const selectedCodes = new Set(normalized.topupBaseKeys);
  const accountIds = new Set(normalized.accountCategoryIds);
  const giftIds = new Set(normalized.giftCategoryIds);

  if (selectedCodes.size === 0 && accountIds.size === 0 && giftIds.size === 0) {
    return games;
  }

  return games.filter((game) => {
    if (game.catalog_source === 'live') {
      const code = String(game.code || game.g2bulk_game_code || '').trim();
      if (code && normalized.topupLiveBaseKeys.includes(code)) return true;
      if (game.redemption_method === 'redeem_code') {
        return voucherMatchesCategorySets(
          game,
          new Set(normalized.accountLiveCategoryIds),
          new Set(normalized.giftLiveCategoryIds),
        );
      }
      return false;
    }
    if (game.redemption_method === 'uid') {
      return parentMatchesTopupKey(game, selectedCodes);
    }
    if (game.redemption_method === 'redeem_code') {
      return voucherMatchesCategorySets(
        game,
        new Set(normalized.accountSyncCategoryIds),
        new Set(normalized.giftSyncCategoryIds),
      );
    }
    return false;
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
    const code = String(game.code || '').trim();
    if (!code) continue;
    const aliases = [
      code,
      code.toLowerCase(),
      slugifyPullKey(code),
      slugifyUnderscoreKey(code),
    ];
    aliases.forEach((alias) => {
      if (alias) keyToCanonical.set(alias, code);
    });
  }
  return keyToCanonical;
}

export function resolveCatalogBaseKey(key, index) {
  const raw = String(key || '').trim();
  if (!raw) return '';
  return index.get(raw)
    || index.get(raw.toLowerCase())
    || index.get(slugifyPullKey(raw))
    || index.get(slugifyUnderscoreKey(raw))
    || '';
}

function buildValidCatalogGameCodes(catalog = {}) {
  return new Set(
    (catalog.games || [])
      .map((game) => String(game.code || '').trim())
      .filter(Boolean),
  );
}

function buildValidVoucherCategoryIds(catalog = {}) {
  return {
    accounts: new Set(
      (catalog.accounts || [])
        .map((row) => Number(row.categoryId))
        .filter((value) => Number.isFinite(value)),
    ),
    giftCards: new Set(
      (catalog.giftCards || [])
        .map((row) => Number(row.categoryId))
        .filter((value) => Number.isFinite(value)),
    ),
  };
}

/** Drop legacy baseKeys and API-removed games/vouchers from a saved pull selection. */
export function pruneSelectionToCatalog(selection = {}, catalog = {}) {
  const normalized = normalizePullSelection(selection);
  const index = buildCatalogKeyIndex(catalog.games || []);
  const validCodes = buildValidCatalogGameCodes(catalog);
  const voucherIds = buildValidVoucherCategoryIds(catalog);

  const pruneKeys = (keys = []) => [...new Set(
    keys
      .map((value) => resolveCatalogBaseKey(value, index))
      .filter((code) => code && validCodes.has(code)),
  )];

  const pruneIds = (ids = [], valid = new Set()) => [...new Set(
    ids
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && valid.has(value)),
  )];

  const allVoucherIds = new Set([
    ...voucherIds.accounts,
    ...voucherIds.giftCards,
  ]);

  const pruneCarouselKeys = (keys = []) => [...new Set(
    keys
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((key) => {
        const parsed = parseCarouselKey(key);
        if (!parsed) return false;
        if (parsed.kind === 'voucher') {
          return allVoucherIds.has(parsed.categoryId);
        }
        const code = resolveCatalogBaseKey(parsed.code, index);
        return code && validCodes.has(code);
      })
      .map((key) => {
        const parsed = parseCarouselKey(key);
        if (!parsed) return key;
        if (parsed.kind === 'voucher') return carouselKeyForVoucher(parsed.categoryId);
        return resolveCatalogBaseKey(parsed.code, index) || parsed.code;
      })
      .filter(Boolean),
  )];

  return normalizePullSelection({
    ...normalized,
    topupSyncBaseKeys: pruneKeys(normalized.topupSyncBaseKeys),
    topupLiveBaseKeys: pruneKeys(normalized.topupLiveBaseKeys),
    accountSyncCategoryIds: pruneIds(normalized.accountSyncCategoryIds, voucherIds.accounts),
    accountLiveCategoryIds: pruneIds(normalized.accountLiveCategoryIds, voucherIds.accounts),
    giftSyncCategoryIds: pruneIds(normalized.giftSyncCategoryIds, voucherIds.giftCards),
    giftLiveCategoryIds: pruneIds(normalized.giftLiveCategoryIds, voucherIds.giftCards),
    carouselBaseKeys: pruneCarouselKeys(normalized.carouselBaseKeys),
  });
}

export function alignSelectionSetsToCatalog(selection, catalog = {}) {
  const pruned = pruneSelectionToCatalog(selectionPayloadFromSets(selection), catalog);
  return selectionSetsFromPayload(pruned);
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

/** @deprecated Synced DB rows are no longer auto-added — admin picks games explicitly. */
export function applySyncedCatalogToSelection(_catalog = {}, selection) {
  return {
    topupSyncBaseKeys: new Set(selection.topupSyncBaseKeys),
    topupLiveBaseKeys: new Set(selection.topupLiveBaseKeys),
    accountSyncCategoryIds: new Set(selection.accountSyncCategoryIds),
    accountLiveCategoryIds: new Set(selection.accountLiveCategoryIds),
    giftSyncCategoryIds: new Set(selection.giftSyncCategoryIds),
    giftLiveCategoryIds: new Set(selection.giftLiveCategoryIds),
    carouselBaseKeys: new Set(selection.carouselBaseKeys),
  };
}

export function filterLiveCatalog(catalog = {}, pull = {}) {
  const normalized = normalizePullSelection(pull);
  const liveKeys = new Set(normalized.topupLiveBaseKeys);
  const liveAccountIds = new Set(normalized.accountLiveCategoryIds);
  const liveGiftIds = new Set(normalized.giftLiveCategoryIds);

  const games = (catalog.games || []).filter((game) => {
    const code = String(game.code || game.g2bulk_game_code || '').trim();
    if (code && liveKeys.has(code)) return true;
    if (game.redemption_method === 'redeem_code') {
      return voucherMatchesCategorySets(game, liveAccountIds, liveGiftIds);
    }
    return false;
  });

  const gameIds = new Set(games.map((game) => game.id));
  const offers = (catalog.offers || []).filter((offer) => gameIds.has(offer.game_id));

  return { games, offers };
}