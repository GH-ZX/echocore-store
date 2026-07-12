import { g2bulkGetMe } from './g2bulk';
import { normalizeG2bulkWallet } from './g2bulkWalletFormat';
import { fetchAllSamWalletBalances } from './samApi';
import { normalizeSamBalances } from './samWalletFormat';

export const SUPPLIER_WALLETS_CACHE_KEY = 'supplier';
const STORAGE_PREFIX = 'echocore-supplier-wallets';

export const DEFAULT_STALE_MS = 3 * 60 * 1000;
export const DEFAULT_POLL_MS = 3 * 60 * 1000;

export function emptySupplierWalletsSnapshot() {
  return {
    fetchedAt: null,
    g2bulk: null,
    g2bulkError: null,
    samWallets: [],
    samError: null,
    samNotConfigured: false,
  };
}

function normalizeSamWalletRows(wallets) {
  if (!Array.isArray(wallets)) return [];
  return wallets.map((wallet) => ({
    id: wallet.id,
    provider: wallet.provider,
    providerDisplayName: wallet.providerDisplayName || wallet.provider,
    label: wallet.label || '',
    identifier: wallet.identifier || '',
    balances: normalizeSamBalances(wallet.balances),
    error: wallet.error || null,
  }));
}

function buildStorageKey(cacheKey = SUPPLIER_WALLETS_CACHE_KEY) {
  return `${STORAGE_PREFIX}:${cacheKey || SUPPLIER_WALLETS_CACHE_KEY}`;
}

export function readSupplierWalletsCache(cacheKey = SUPPLIER_WALLETS_CACHE_KEY) {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(buildStorageKey(cacheKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      ...emptySupplierWalletsSnapshot(),
      ...parsed,
      samWallets: Array.isArray(parsed.samWallets) ? parsed.samWallets : [],
    };
  } catch {
    return null;
  }
}

export function writeSupplierWalletsCache(cacheKey, snapshot) {
  if (typeof window === 'undefined' || !snapshot) return;
  try {
    sessionStorage.setItem(buildStorageKey(cacheKey), JSON.stringify({
      ...snapshot,
      fetchedAt: snapshot.fetchedAt || Date.now(),
    }));
  } catch {
    /* quota / private mode */
  }
}

export function isSupplierWalletsCacheStale(fetchedAt, staleAfterMs = DEFAULT_STALE_MS) {
  if (!fetchedAt || !staleAfterMs) return false;
  return Date.now() - fetchedAt >= staleAfterMs;
}

export async function fetchAdminSupplierWalletsSnapshot() {
  const [g2Result, samResult] = await Promise.allSettled([
    g2bulkGetMe(),
    fetchAllSamWalletBalances(),
  ]);

  const snapshot = emptySupplierWalletsSnapshot();
  snapshot.fetchedAt = Date.now();

  if (g2Result.status === 'fulfilled') {
    snapshot.g2bulk = normalizeG2bulkWallet(g2Result.value);
  } else {
    snapshot.g2bulkError = g2Result.reason?.message || 'Failed to load G2Bulk wallet';
  }

  if (samResult.status === 'fulfilled') {
    snapshot.samWallets = normalizeSamWalletRows(samResult.value?.wallets);
  } else {
    const message = samResult.reason?.message || 'Failed to load Sam wallets';
    if (/not configured|api key/i.test(message)) {
      snapshot.samNotConfigured = true;
    } else {
      snapshot.samError = message;
    }
  }

  return snapshot;
}

export function mergeSupplierWalletsSnapshot(previous, next) {
  if (!previous?.fetchedAt) return next;
  return {
    fetchedAt: next.fetchedAt || previous.fetchedAt,
    g2bulk: next.g2bulk ?? previous.g2bulk,
    g2bulkError: next.g2bulk ? null : (next.g2bulkError || previous.g2bulkError),
    samWallets: next.samWallets?.length > 0 ? next.samWallets : previous.samWallets,
    samError: (next.samWallets?.length > 0 || next.samNotConfigured) ? null : (next.samError || previous.samError),
    samNotConfigured: next.samNotConfigured
      ? true
      : (next.samWallets?.length > 0 ? false : previous.samNotConfigured),
  };
}