import {
  DEFAULT_POLL_MS,
  DEFAULT_STALE_MS,
  SUPPLIER_WALLETS_CACHE_KEY,
  emptySupplierWalletsSnapshot,
  fetchG2bulkWalletPart,
  fetchSamWalletsPart,
  isSupplierWalletsCacheStale,
  mergeG2bulkIntoSnapshot,
  mergeSamIntoSnapshot,
  readSupplierWalletsCache,
  writeSupplierWalletsCache,
} from './adminSupplierWallets';

const watchers = new Map();
const listeners = new Set();

let cacheKey = SUPPLIER_WALLETS_CACHE_KEY;
let snapshot = emptySupplierWalletsSnapshot();
let loading = false;
let g2bulkLoading = false;
let samLoading = false;
let hasFetched = false;
let g2InFlight = false;
let samInFlight = false;
let pollTimer = null;

function getMergedWatcherOptions() {
  const options = [...watchers.values()];
  if (!options.length) return null;
  return {
    cacheKey: options[0]?.cacheKey || SUPPLIER_WALLETS_CACHE_KEY,
    fetchOnMount: options.some((entry) => entry.fetchOnMount !== false),
    staleAfterMs: Math.min(...options.map((entry) => entry.staleAfterMs ?? DEFAULT_STALE_MS)),
    // Prefer the largest requested interval; default 1 minute when any watcher wants polling.
    pollIntervalMs: Math.max(
      0,
      ...options.map((entry) => (
        entry.pollIntervalMs === undefined ? DEFAULT_POLL_MS : entry.pollIntervalMs
      )),
    ),
  };
}

function hydrateFromCache(key = cacheKey) {
  const cached = readSupplierWalletsCache(key);
  if (!cached?.fetchedAt && !cached?.g2bulk && !(cached?.samWallets?.length)) return false;
  snapshot = cached;
  hasFetched = true;
  return true;
}

function buildPublicState() {
  const g2Ready = !!snapshot.g2bulk || !!snapshot.g2bulkError;
  const samReady = snapshot.samWallets.length > 0
    || snapshot.samNotConfigured
    || !!snapshot.samError;

  return {
    snapshot,
    loading: loading || g2bulkLoading || samLoading,
    g2bulkLoading,
    samLoading,
    hasFetched,
    g2bulkWallet: snapshot.g2bulk,
    g2bulkError: snapshot.g2bulkError,
    g2bulkFetched: hasFetched && g2Ready,
    samWallets: snapshot.samWallets,
    samError: snapshot.samError,
    samNotConfigured: snapshot.samNotConfigured,
    samFetched: hasFetched && samReady,
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

function persist(next) {
  snapshot = next;
  hasFetched = true;
  writeSupplierWalletsCache(cacheKey, next);
}

/** Serialize snapshot writes so parallel G2/Sam merges cannot clobber each other. */
let persistChain = Promise.resolve();
function enqueuePersist(mutator) {
  persistChain = persistChain
    .then(() => {
      const next = mutator(snapshot);
      persist(next);
      return next;
    })
    .catch(() => snapshot);
  return persistChain;
}

function maybeBootstrap(merged) {
  if (!merged) return;

  cacheKey = merged.cacheKey;
  const hadCache = hydrateFromCache(cacheKey);
  emit();

  const stale = isSupplierWalletsCacheStale(snapshot.fetchedAt, merged.staleAfterMs);

  if (hadCache && !stale && hasFetched) {
    // Still schedule silent refresh if very old g2/sam half is missing.
    if (!snapshot.g2bulk && !snapshot.g2bulkError) {
      refreshG2bulkWallet({ silent: true });
    }
    if (!snapshot.samWallets?.length && !snapshot.samError && !snapshot.samNotConfigured) {
      refreshSamWallets({ silent: true });
    }
    return;
  }

  if (merged.fetchOnMount || stale || !hasFetched) {
    refreshSupplierWallets({ silent: hadCache, key: cacheKey });
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

/** Refresh G2Bulk wallet only. */
export async function refreshG2bulkWallet({ silent = false } = {}) {
  if (g2InFlight) return snapshot;
  g2InFlight = true;
  if (!silent) {
    g2bulkLoading = true;
    emit();
  }

  try {
    const part = await fetchG2bulkWalletPart();
    return await enqueuePersist((prev) => mergeG2bulkIntoSnapshot(prev, part));
  } finally {
    g2InFlight = false;
    if (!silent) g2bulkLoading = false;
    emit();
  }
}

/** Refresh Sam wallets only. */
export async function refreshSamWallets({ silent = false } = {}) {
  if (samInFlight) return snapshot;
  samInFlight = true;
  if (!silent) {
    samLoading = true;
    emit();
  }

  try {
    const part = await fetchSamWalletsPart();
    return await enqueuePersist((prev) => mergeSamIntoSnapshot(prev, part));
  } finally {
    samInFlight = false;
    if (!silent) samLoading = false;
    emit();
  }
}

/**
 * Refresh both APIs in parallel (independent merge — one failure cannot zero the other).
 * Manual refresh always merges with last good values.
 */
export async function refreshSupplierWallets({ silent = false, key = cacheKey } = {}) {
  cacheKey = key || cacheKey;

  if (g2InFlight && samInFlight) return snapshot;

  if (!silent) {
    loading = true;
    g2bulkLoading = true;
    samLoading = true;
    emit();
  }

  try {
    // Fetch both in parallel; merge through a serialized queue so neither overwrites the other.
    const tasks = [];
    if (!g2InFlight) {
      g2InFlight = true;
      tasks.push(
        fetchG2bulkWalletPart()
          .then((part) => enqueuePersist((prev) => mergeG2bulkIntoSnapshot(prev, part)))
          .finally(() => {
            g2InFlight = false;
          }),
      );
    }
    if (!samInFlight) {
      samInFlight = true;
      tasks.push(
        fetchSamWalletsPart()
          .then((part) => enqueuePersist((prev) => mergeSamIntoSnapshot(prev, part)))
          .finally(() => {
            samInFlight = false;
          }),
      );
    }

    if (tasks.length) {
      await Promise.all(tasks);
    }
    // If both were already in flight, wait a tick for their merges to finish.
    await persistChain;
    return snapshot;
  } catch (err) {
    if (!silent && !snapshot.g2bulkError && !snapshot.samError) {
      snapshot = {
        ...snapshot,
        g2bulkError: snapshot.g2bulkError || err.message || 'Failed to refresh supplier wallets',
      };
    }
    hasFetched = true;
    return snapshot;
  } finally {
    if (!silent) {
      loading = false;
      g2bulkLoading = false;
      samLoading = false;
    }
    emit();
  }
}

export function registerSupplierWalletsWatcher(enabled, options = {}) {
  if (!enabled) return () => {};

  const id = Symbol();
  watchers.set(id, options);

  const merged = getMergedWatcherOptions();
  maybeBootstrap(merged);
  ensurePollTimer(merged?.pollIntervalMs ?? DEFAULT_POLL_MS);

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
  g2bulkLoading = false;
  samLoading = false;
  hasFetched = false;
  g2InFlight = false;
  samInFlight = false;
  emit();
}
