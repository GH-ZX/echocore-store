import { g2bulkGetMe } from './g2bulk';
import { normalizeG2bulkWallet } from './g2bulkWalletFormat';
import { fetchAllSamWalletBalances } from './samApi';
import { normalizeSamBalances } from './samWalletFormat';

export const SUPPLIER_WALLETS_CACHE_KEY = 'supplier';
const STORAGE_PREFIX = 'echocore-supplier-wallets';

/** Poll while admin UI is open */
export const DEFAULT_POLL_MS = 60 * 1000;
/** Treat cache older than this as stale on mount */
export const DEFAULT_STALE_MS = 45 * 1000;

export function emptySupplierWalletsSnapshot() {
  return {
    fetchedAt: null,
    g2bulkFetchedAt: null,
    samFetchedAt: null,
    g2bulk: null,
    g2bulkError: null,
    samWallets: [],
    samError: null,
    samNotConfigured: false,
  };
}

function normalizeSamWalletRows(wallets) {
  if (!Array.isArray(wallets)) return [];
  return wallets.map((wallet) => {
    const rawBalances = Array.isArray(wallet.balances) ? wallet.balances : [];
    const hasBalancePayload = rawBalances.length > 0;
    return {
      id: wallet.id,
      provider: wallet.provider,
      providerDisplayName: wallet.providerDisplayName || wallet.provider,
      label: wallet.label || '',
      identifier: wallet.identifier || '',
      // Only normalize real balance rows — empty + error means "unknown", not $0.
      balances: hasBalancePayload ? normalizeSamBalances(rawBalances) : [],
      error: wallet.error || null,
      balanceOk: hasBalancePayload && !wallet.error,
    };
  });
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
  if (!fetchedAt || !staleAfterMs) return true;
  return Date.now() - fetchedAt >= staleAfterMs;
}

async function withRetry(fn, { retries = 1, delayMs = 800 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = String(err?.message || '');
      const retryable = /timeout|network|fetch|failed to send|relay|temporarily/i.test(msg);
      if (attempt < retries && retryable) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/** G2Bulk only — independent of Sam. */
export async function fetchG2bulkWalletPart() {
  try {
    const me = await withRetry(() => g2bulkGetMe());
    const wallet = normalizeG2bulkWallet(me);
    if (!wallet) {
      return {
        g2bulk: null,
        g2bulkError: 'G2Bulk returned no usable balance',
        g2bulkFetchedAt: Date.now(),
      };
    }
    return {
      g2bulk: wallet,
      g2bulkError: null,
      g2bulkFetchedAt: Date.now(),
    };
  } catch (err) {
    return {
      g2bulk: null,
      g2bulkError: err?.message || 'Failed to load G2Bulk wallet',
      g2bulkFetchedAt: Date.now(),
    };
  }
}

/** Sam only — independent of G2Bulk. */
export async function fetchSamWalletsPart() {
  try {
    const data = await withRetry(() => fetchAllSamWalletBalances());
    const wallets = normalizeSamWalletRows(data?.wallets);
    return {
      samWallets: wallets,
      samError: null,
      samNotConfigured: false,
      samFetchedAt: Date.now(),
    };
  } catch (err) {
    const message = err?.message || 'Failed to load Sam wallets';
    if (/not configured|api key/i.test(message)) {
      return {
        samWallets: [],
        samError: null,
        samNotConfigured: true,
        samFetchedAt: Date.now(),
      };
    }
    return {
      samWallets: [],
      samError: message,
      samNotConfigured: false,
      samFetchedAt: Date.now(),
    };
  }
}

/** Parallel fetch both APIs without coupling success. */
export async function fetchAdminSupplierWalletsSnapshot() {
  const [g2, sam] = await Promise.all([
    fetchG2bulkWalletPart(),
    fetchSamWalletsPart(),
  ]);
  return {
    ...emptySupplierWalletsSnapshot(),
    fetchedAt: Date.now(),
    ...g2,
    ...sam,
  };
}

function mergeSamWalletRows(previous = [], next = []) {
  if (!next.length) return previous.length ? previous : next;
  if (!previous.length) return next;

  const prevByKey = new Map();
  previous.forEach((row) => {
    const key = String(row.id || row.identifier || `${row.provider}:${row.label}`);
    prevByKey.set(key, row);
  });

  return next.map((row) => {
    const key = String(row.id || row.identifier || `${row.provider}:${row.label}`);
    const prev = prevByKey.get(key);
    // Keep last good balances when this refresh returned empty/error for that wallet.
    if (prev && (!row.balanceOk || !row.balances?.length) && prev.balances?.length) {
      return {
        ...row,
        balances: prev.balances,
        balanceOk: true,
        error: row.error || prev.error || null,
      };
    }
    return row;
  });
}

/**
 * Merge next fetch into previous so a flaky response never wipes a good balance with $0/null.
 * Always merge (manual + silent) — never full-replace with empty/error parts.
 */
export function mergeSupplierWalletsSnapshot(previous, next) {
  if (!previous?.fetchedAt && !previous?.g2bulk && !(previous?.samWallets?.length)) {
    return next;
  }

  const g2Ok = next.g2bulk != null && Number.isFinite(Number(next.g2bulk.balance));
  const samOk = Array.isArray(next.samWallets)
    && next.samWallets.length > 0
    && next.samWallets.some((w) => w.balanceOk || (w.balances?.length > 0));

  return {
    fetchedAt: next.fetchedAt || previous.fetchedAt || Date.now(),
    g2bulkFetchedAt: g2Ok
      ? (next.g2bulkFetchedAt || next.fetchedAt)
      : (previous.g2bulkFetchedAt || previous.fetchedAt),
    samFetchedAt: (samOk || next.samNotConfigured)
      ? (next.samFetchedAt || next.fetchedAt)
      : (previous.samFetchedAt || previous.fetchedAt),
    g2bulk: g2Ok ? next.g2bulk : (previous.g2bulk ?? next.g2bulk),
    g2bulkError: g2Ok
      ? null
      : (next.g2bulkError || (previous.g2bulk ? null : previous.g2bulkError)),
    samWallets: mergeSamWalletRows(previous.samWallets, next.samWallets),
    samError: (samOk || next.samNotConfigured)
      ? null
      : (next.samError || (previous.samWallets?.length ? null : previous.samError)),
    samNotConfigured: next.samNotConfigured
      ? true
      : (samOk ? false : previous.samNotConfigured),
  };
}

export function mergeG2bulkIntoSnapshot(previous, g2Part) {
  return mergeSupplierWalletsSnapshot(previous, {
    ...emptySupplierWalletsSnapshot(),
    fetchedAt: g2Part.g2bulkFetchedAt || Date.now(),
    ...g2Part,
    samWallets: previous?.samWallets || [],
    samError: previous?.samError ?? null,
    samNotConfigured: previous?.samNotConfigured ?? false,
    samFetchedAt: previous?.samFetchedAt ?? null,
  });
}

export function mergeSamIntoSnapshot(previous, samPart) {
  return mergeSupplierWalletsSnapshot(previous, {
    ...emptySupplierWalletsSnapshot(),
    fetchedAt: samPart.samFetchedAt || Date.now(),
    g2bulk: previous?.g2bulk ?? null,
    g2bulkError: previous?.g2bulkError ?? null,
    g2bulkFetchedAt: previous?.g2bulkFetchedAt ?? null,
    ...samPart,
  });
}
