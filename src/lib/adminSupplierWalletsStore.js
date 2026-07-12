import {
  DEFAULT_STALE_MS,
  SUPPLIER_WALLETS_CACHE_KEY,
  emptySupplierWalletsSnapshot,
  fetchAdminSupplierWalletsSnapshot,
  isSupplierWalletsCacheStale,
  mergeSupplierWalletsSnapshot,
  readSupplierWalletsCache,
  writeSupplierWalletsCache,
} from './adminSupplierWallets';

const watchers = new Map();
const listeners = new Set();

let cacheKey = SUPPLIER_WALLETS_CACHE_KEY;
let snapshot = emptySupplierWalletsSnapshot();
let loading = false;
let hasFetched = false;
let inFlight = false;
let pollTimer = null;

function getMergedWatcherOptions() {
  const options = [...watchers.values()];
  if (!options.length) return null;
  return {
    cacheKey: options[0]?.cacheKey || SUPPLIER_WALLETS_CACHE_KEY,
    fetchOnMount: options.some((entry) => entry.fetchOnMount !== false),
    staleAfterMs: Math.min(...options.map((entry) => entry.staleAfterMs ?? DEFAULT_STALE_MS)),
    pollIntervalMs: Math.max(...options.map((entry) => entry.pollIntervalMs ?? 0)),
  };
}

function hydrateFromCache(key = cacheKey) {
  const cached = readSupplierWalletsCache(key);
  if (!cached?.fetchedAt) return false;
  snapshot = cached;
  hasFetched = true;
  return true;
}

function buildPublicState() {
  return {
    snapshot,
    loading,
    hasFetched,
    g2bulkWallet: snapshot.g2bulk,
    g2bulkError: snapshot.g2bulkError,
    g2bulkFetched: hasFetched && (!!snapshot.g2bulk || !!snapshot.g2bulkError),
    samWallets: snapshot.samWallets,
    samError: snapshot.samError,
    samNotConfigured: snapshot.samNotConfigured,
    samFetched: hasFetched && (
      snapshot.samWallets.length > 0
      || snapshot.samNotConfigured
      || !!snapshot.samError
    ),
    idle: !hasFetched,
  };
}

function emit() {
  const payload = buildPublicState();
  listeners.forEach((listener) => listener(payload));
}

function clearPollTimer() {
  if (pollTimer) {
    window.clearInterval(pollTimer);
    pollTimer = null;
  }
}

function ensurePollTimer(intervalMs = 0) {
  clearPollTimer();
  if (!intervalMs || intervalMs <= 0 || watchers.size === 0) return;
  pollTimer = window.setInterval(() => {
    refreshSupplierWallets({ silent: true });
  }, intervalMs);
}

function maybeBootstrap(merged) {
  if (!merged || inFlight) return;

  cacheKey = merged.cacheKey;
  const hadCache = hydrateFromCache(cacheKey);
  emit();

  if (hasFetched && hadCache && isSupplierWalletsCacheStale(snapshot.fetchedAt, merged.staleAfterMs)) {
    refreshSupplierWallets({ silent: true, key: cacheKey });
    return;
  }

  if (hasFetched) return;

  if (merged.fetchOnMount) {
    refreshSupplierWallets({ silent: hadCache, key: cacheKey });
    return;
  }

  if (hadCache && isSupplierWalletsCacheStale(snapshot.fetchedAt, merged.staleAfterMs)) {
    refreshSupplierWallets({ silent: true, key: cacheKey });
  }
}

export function getSupplierWalletsState() {
  return buildPublicState();
}

export function subscribeSupplierWallets(listener) {
  listeners.add(listener);
  listener(buildPublicState());
  return () => listeners.delete(listener);
}

export async function refreshSupplierWallets({ silent = false, key = cacheKey } = {}) {
  if (inFlight) return snapshot;

  inFlight = true;
  cacheKey = key || cacheKey;
  if (!silent) loading = true;
  emit();

  try {
    const fetched = await fetchAdminSupplierWalletsSnapshot();
    const merged = silent
      ? mergeSupplierWalletsSnapshot(snapshot, fetched)
      : fetched;
    snapshot = merged;
    hasFetched = true;
    writeSupplierWalletsCache(cacheKey, merged);
    return merged;
  } catch (err) {
    if (!silent) {
      snapshot = {
        ...snapshot,
        g2bulkError: snapshot.g2bulkError || err.message || 'Failed to refresh supplier wallets',
      };
    }
    hasFetched = true;
    return snapshot;
  } finally {
    inFlight = false;
    if (!silent) loading = false;
    emit();
  }
}

export function registerSupplierWalletsWatcher(enabled, options = {}) {
  if (!enabled) return () => {};

  const id = Symbol();
  watchers.set(id, options);

  const merged = getMergedWatcherOptions();
  maybeBootstrap(merged);
  ensurePollTimer(merged?.pollIntervalMs ?? 0);

  return () => {
    watchers.delete(id);
    const next = getMergedWatcherOptions();
    ensurePollTimer(next?.pollIntervalMs ?? 0);
  };
}

export function resetSupplierWalletsStore() {
  clearPollTimer();
  watchers.clear();
  snapshot = emptySupplierWalletsSnapshot();
  loading = false;
  hasFetched = false;
  inFlight = false;
  emit();
}