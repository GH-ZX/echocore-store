import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js';
import { brandUserText } from './branding';
import {
  buildPullCatalogClientFallback,
  isEdgeTransportError,
} from './g2bulkPullCatalogClient';
import { supabase } from './supabase';

async function parseInvokeError(error, { sanitizeForUser = false } = {}) {
  let message = error.message || 'G2Bulk request failed';
  if (error instanceof FunctionsHttpError && error.context) {
    try {
      const body = await error.context.json();
      if (body?.message) message = body.message;
      else if (typeof body?.error === 'string') message = body.error;
    } catch {
      try {
        const text = await error.context.text();
        if (text) message = text.slice(0, 300);
      } catch {
        /* keep default */
      }
    }
  }
  if (/non-2xx/i.test(message)) {
    message = 'Catalog sync timed out or failed on the server. Try again — sync now runs in smaller batches.';
  }
  if (/unauthorized|admin only|jwt/i.test(message)) {
    message = 'Admin session expired or access denied. Log out, log back in as admin, then retry.';
  }
  if (/failed to send a request to the edge function|failed to fetch|networkerror|load failed/i.test(message)) {
    message = 'Sync lost connection to the G2Bulk Edge Function (request too slow or network drop). Wait a moment and retry — sync now runs in smaller batches.';
  }
  if (/relay error invoking the edge function/i.test(message)) {
    message = 'G2Bulk Edge Function timed out on the server. Wait a moment and retry — sync now runs in smaller batches.';
  }
  return sanitizeForUser ? brandUserText(message) : message;
}

function isRetryableInvokeError(error) {
  return error instanceof FunctionsFetchError
    || error instanceof FunctionsRelayError
    || isEdgeTransportError(error);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeG2bulk(body, { sanitizeForUser = false, retries = 2 } = {}) {
  let lastError = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const { data, error } = await supabase.functions.invoke('g2bulk', { body });
    if (!error) {
      if (data?.success === false) {
        const message = data.message || (sanitizeForUser ? 'Fulfillment request failed' : 'G2Bulk request failed');
        throw new Error(sanitizeForUser ? brandUserText(message) : message);
      }
      return data;
    }

    lastError = error;
    if (attempt < retries && isRetryableInvokeError(error)) {
      await sleep(1200 * (attempt + 1));
      continue;
    }
    break;
  }

  throw new Error(await parseInvokeError(lastError, { sanitizeForUser }));
}

/** Admin: verify API key + read G2Bulk wallet balance */
export async function g2bulkGetMe() {
  return invokeG2bulk({ action: 'getMe' });
}

/** Admin: read settings (key is masked) */
export async function fetchG2bulkSettings() {
  const data = await invokeG2bulk({ action: 'getSettings' });
  return data.settings;
}

/** Admin: save enabled, markup, catalog mode; pass apiKey only when changing it */
export async function saveG2bulkSettings({
  enabled,
  markupPercent,
  apiKey,
  catalogOnly,
  catalogMode,
  autoSyncEnabled,
  autoSyncHour,
  autoSyncTimezone,
}) {
  const data = await invokeG2bulk({
    action: 'saveSettings',
    enabled: enabled !== undefined ? !!enabled : undefined,
    markupPercent: markupPercent !== undefined ? Number(markupPercent) : undefined,
    apiKey: apiKey !== undefined ? (apiKey?.trim() || '') : undefined,
    catalogOnly: catalogOnly !== undefined ? !!catalogOnly : undefined,
    catalogMode: catalogMode !== undefined ? (catalogMode?.trim() || 'sync') : undefined,
    autoSyncEnabled: autoSyncEnabled !== undefined ? !!autoSyncEnabled : undefined,
    autoSyncHour: autoSyncHour !== undefined ? Number(autoSyncHour) : undefined,
    autoSyncTimezone: autoSyncTimezone !== undefined ? (autoSyncTimezone?.trim() || null) : undefined,
  });

  if (data?.settings) {
    return data.settings;
  }

  return data;
}

/** Keep each edge invoke under ~15s so browser fetch does not drop mid-sync. */
const GAMES_BATCH_SIZE = 3;
const CHECK_BATCH_SIZE = 8;

function mergeCheckTotals(base, extra = {}) {
  return {
    newGames: (base.newGames || 0) + (extra.newGames || 0),
    removedGames: (base.removedGames || 0) + (extra.removedGames || 0),
    newOffers: (base.newOffers || 0) + (extra.newOffers || 0),
    priceChanges: (base.priceChanges || 0) + (extra.priceChanges || 0),
    removedOffers: (base.removedOffers || 0) + (extra.removedOffers || 0),
    stockChanges: (base.stockChanges || 0) + (extra.stockChanges || 0),
    unchangedOffers: (base.unchangedOffers || 0) + (extra.unchangedOffers || 0),
    errors: [...(base.errors || []), ...(extra.errors || [])],
  };
}

function mergeCheckSamples(base, extra = {}) {
  const take = (left = [], right = [], max = 8) => [...left, ...right].slice(0, max);
  return {
    newGames: take(base.newGames, extra.newGames),
    removedGames: take(base.removedGames, extra.removedGames),
    priceChanges: take(base.priceChanges, extra.priceChanges),
    newOffers: take(base.newOffers, extra.newOffers),
    removedOffers: take(base.removedOffers, extra.removedOffers),
  };
}

/**
 * Admin: import games + offers from G2Bulk in batches (avoids edge-function timeout).
 * @param {object} options
 * @param {boolean} [options.includeVouchers]
 * @param {boolean} [options.hideManual]
 * @param {(progress: object) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 */
export async function syncG2bulkCatalog({
  includeVouchers = true,
  hideManual = true,
  onProgress,
  signal,
} = {}) {
  const totals = {
    gamesSynced: 0,
    offersSynced: 0,
    offersSkipped: 0,
    errors: [],
  };

  const report = (phase, extra = {}) => {
    onProgress?.({ phase, ...totals, ...extra });
  };

  const checkAbort = () => {
    if (signal?.aborted) {
      throw new Error('Catalog sync cancelled');
    }
  };

  checkAbort();
  report('init');
  const init = await invokeG2bulk({
    action: 'syncCatalog',
    phase: 'init',
    hideManual,
    includeGiftCards: includeVouchers,
  });

  const totalGames = init.totalGames ?? 0;
  let offset = 0;

  report('games', { current: 0, total: totalGames });

  while (offset < totalGames) {
    checkAbort();
    const batch = await invokeG2bulk({
      action: 'syncCatalog',
      phase: 'games',
      offset,
      limit: GAMES_BATCH_SIZE,
    });

    totals.gamesSynced += batch.gamesSynced ?? 0;
    totals.offersSynced += batch.offersSynced ?? 0;
    totals.offersSkipped += batch.offersSkipped ?? 0;
    if (batch.errors?.length) {
      totals.errors.push(...batch.errors);
    }

    offset = batch.nextOffset ?? offset + GAMES_BATCH_SIZE;
    report('games', { current: Math.min(offset, totalGames), total: totalGames });

    if (batch.gamesDone) break;
  }

  if (includeVouchers) {
    checkAbort();
    report('vouchers', { current: totalGames, total: totalGames });
    const vouchers = await invokeG2bulk({
      action: 'syncCatalog',
      phase: 'vouchers',
      includeGiftCards: includeVouchers,
    });
    totals.gamesSynced += vouchers.gamesSynced ?? 0;
    totals.offersSynced += vouchers.offersSynced ?? 0;
    totals.offersSkipped += vouchers.offersSkipped ?? 0;
    if (vouchers.errors?.length) {
      totals.errors.push(...vouchers.errors);
    }
  }

  checkAbort();
  report('finalize');
  const finalized = await invokeG2bulk({ action: 'syncCatalog', phase: 'finalize' });

  return {
    ...totals,
    errors: totals.errors.slice(0, 20),
    syncedAt: finalized.syncedAt,
  };
}

/**
 * Admin: read-only catalog diff vs G2Bulk (batched; does not write offers).
 */
export async function checkG2bulkCatalog({
  includeVouchers = true,
  onProgress,
  signal,
} = {}) {
  const emptyTotals = () => ({
    newGames: 0,
    removedGames: 0,
    newOffers: 0,
    priceChanges: 0,
    removedOffers: 0,
    stockChanges: 0,
    unchangedOffers: 0,
    errors: [],
  });

  const checkAbort = () => {
    if (signal?.aborted) throw new Error('Catalog check cancelled');
  };

  checkAbort();
  onProgress?.({ phase: 'init' });

  const init = await invokeG2bulk({
    action: 'checkCatalog',
    phase: 'init',
  });

  const initTotals = {
    ...emptyTotals(),
    newGames: init.newGames ?? 0,
    removedGames: init.removedGames ?? 0,
  };
  const initSamples = init.samples || { newGames: [], removedGames: [] };

  let gamesTotals = emptyTotals();
  let gamesSamples = { priceChanges: [], newOffers: [], removedOffers: [] };
  const totalGames = init.totalGames ?? 0;
  let offset = 0;

  onProgress?.({ phase: 'games', current: 0, total: totalGames });

  while (offset < totalGames) {
    checkAbort();
    const batch = await invokeG2bulk({
      action: 'checkCatalog',
      phase: 'games',
      offset,
      limit: CHECK_BATCH_SIZE,
    });

    gamesTotals = mergeCheckTotals(gamesTotals, batch);
    gamesSamples = mergeCheckSamples(gamesSamples, batch.samples || {});

    offset = batch.nextOffset ?? offset + CHECK_BATCH_SIZE;
    onProgress?.({ phase: 'games', current: Math.min(offset, totalGames), total: totalGames });
    if (batch.gamesDone) break;
  }

  let vouchersTotals = emptyTotals();
  let vouchersSamples = { priceChanges: [], newOffers: [], removedOffers: [] };

  if (includeVouchers) {
    checkAbort();
    onProgress?.({ phase: 'vouchers', current: totalGames, total: totalGames });
    const vouchers = await invokeG2bulk({ action: 'checkCatalog', phase: 'vouchers' });
    vouchersTotals = mergeCheckTotals(vouchersTotals, vouchers);
    vouchersSamples = mergeCheckSamples(vouchersSamples, vouchers.samples || {});
  }

  checkAbort();
  onProgress?.({ phase: 'finalize' });

  const finalized = await invokeG2bulk({
    action: 'checkCatalog',
    phase: 'finalize',
    initTotals,
    gamesTotals,
    vouchersTotals,
    initSamples,
    gamesSamples,
    vouchersSamples,
  });

  return {
    summary: finalized.summary,
    checkedAt: finalized.checkedAt,
    errors: [...initTotals.errors, ...gamesTotals.errors, ...vouchersTotals.errors].slice(0, 20),
  };
}

/** Authenticated: validate player UID before checkout */
export async function g2bulkCheckPlayer({ game, userId, serverId, charname }) {
  return invokeG2bulk({
    action: 'checkPlayer',
    game,
    user_id: userId,
    server_id: serverId || undefined,
    charname: charname || undefined,
  });
}

/** Authenticated: required checkout fields + server list from G2Bulk (public API proxied). */
export async function g2bulkGetTopupMeta(gameCode) {
  const code = String(gameCode || '').trim();
  if (!code) {
    return { fields: [], servers: [], notes: '', requiresServer: false };
  }
  return invokeG2bulk({ action: 'getTopupMeta', game: code });
}

const PULL_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;
let pullCatalogCache = null;
let pullCatalogCacheAt = 0;

export function invalidateG2bulkPullCatalogCache() {
  pullCatalogCache = null;
  pullCatalogCacheAt = 0;
}

/** Return cached pull catalog if still fresh (for instant panel open). */
export function peekPullCatalogCache() {
  const now = Date.now();
  if (pullCatalogCache && now - pullCatalogCacheAt < PULL_CATALOG_CACHE_TTL_MS) {
    return pullCatalogCache;
  }
  return null;
}

/** Admin: list live G2Bulk catalog grouped for selective pull */
export async function listG2bulkPullCatalog({ refresh = false, settings = null } = {}) {
  const now = Date.now();
  if (!refresh && pullCatalogCache && now - pullCatalogCacheAt < PULL_CATALOG_CACHE_TTL_MS) {
    return pullCatalogCache;
  }

  const resolvedSettings = settings || await fetchG2bulkSettings().catch(() => ({}));
  const data = await buildPullCatalogClientFallback(invokeG2bulk, resolvedSettings);
  pullCatalogCache = data;
  pullCatalogCacheAt = now;
  return data;
}

/** Admin: persist which games/accounts to sync + carousel picks */
export async function saveG2bulkPullSelection(selection, catalogMode = 'sync') {
  const result = await invokeG2bulk({
    action: 'savePullSelection',
    catalogMode: catalogMode === 'live' ? 'live' : 'sync',
    topupSyncBaseKeys: selection.topupSyncBaseKeys || [],
    topupLiveBaseKeys: selection.topupLiveBaseKeys || [],
    topupBaseKeys: selection.topupBaseKeys || [],
    accountSyncCategoryIds: selection.accountSyncCategoryIds || [],
    accountLiveCategoryIds: selection.accountLiveCategoryIds || [],
    accountCategoryIds: selection.accountCategoryIds || [],
    giftSyncCategoryIds: selection.giftSyncCategoryIds || [],
    giftLiveCategoryIds: selection.giftLiveCategoryIds || [],
    giftCategoryIds: selection.giftCategoryIds || [],
    carouselBaseKeys: selection.carouselBaseKeys || [],
  });
  invalidateG2bulkPullCatalogCache();
  return result;
}

/** Admin: remove all synced G2Bulk games and offers from the database */
export async function clearG2bulkSyncedCatalog() {
  const result = await invokeG2bulk({ action: 'clearSyncedCatalog' });
  invalidateG2bulkPullCatalogCache();
  return result;
}

/** Fulfill a completed order via G2Bulk (balance or after admin approval) */
export async function fulfillOrderG2bulk(orderId) {
  return invokeG2bulk({ action: 'fulfillOrder', orderId }, { sanitizeForUser: true });
}

/** Pre-checkout: verify G2Bulk can fulfill before balance is deducted */
export async function checkFulfillmentAvailability({ items = [] } = {}) {
  return invokeG2bulk({ action: 'checkFulfillmentAvailability', items }, { sanitizeForUser: true });
}