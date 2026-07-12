const G2BULK_PREFIX = 'echocore-admin-g2bulk';
const SAM_PREFIX = 'echocore-admin-sam';

function readEntry(key) {
  if (typeof window === 'undefined' || !key) return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeEntry(key, payload) {
  if (typeof window === 'undefined' || !key) return;
  try {
    sessionStorage.setItem(key, JSON.stringify({
      ...payload,
      fetchedAt: Date.now(),
    }));
  } catch {
    /* quota / private mode */
  }
}

function buildKey(prefix, cacheKey) {
  return cacheKey ? `${prefix}:${cacheKey}` : '';
}

export function readG2bulkWalletCache(cacheKey) {
  const key = buildKey(G2BULK_PREFIX, cacheKey);
  const entry = readEntry(key);
  if (!entry) return null;
  return {
    wallet: entry.wallet ?? null,
    error: entry.error ?? null,
    fetchedAt: entry.fetchedAt ?? null,
  };
}

export function writeG2bulkWalletCache(cacheKey, { wallet, error = null }) {
  const key = buildKey(G2BULK_PREFIX, cacheKey);
  writeEntry(key, { wallet, error });
}

export function readSamWalletsCache(cacheKey) {
  const key = buildKey(SAM_PREFIX, cacheKey);
  const entry = readEntry(key);
  if (!entry) return null;
  return {
    wallets: Array.isArray(entry.wallets) ? entry.wallets : [],
    notConfigured: !!entry.notConfigured,
    error: entry.error ?? null,
    fetchedAt: entry.fetchedAt ?? null,
  };
}

export function writeSamWalletsCache(cacheKey, { wallets, notConfigured = false, error = null }) {
  const key = buildKey(SAM_PREFIX, cacheKey);
  writeEntry(key, { wallets, notConfigured, error });
}

export function isWalletCacheStale(fetchedAt, staleAfterMs) {
  if (!fetchedAt || !staleAfterMs) return false;
  return Date.now() - fetchedAt >= staleAfterMs;
}