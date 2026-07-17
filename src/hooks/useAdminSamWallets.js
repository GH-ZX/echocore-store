import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllSamWalletBalances } from '../lib/samApi';
import { normalizeSamBalances } from '../lib/samWalletFormat';
import {
  isWalletCacheStale,
  readSamWalletsCache,
  writeSamWalletsCache,
} from '../lib/adminWalletCache';

const DEFAULT_STALE_MS = 45 * 1000;
const DEFAULT_POLL_MS = 60 * 1000;

function normalizeWalletRows(wallets) {
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
      balances: hasBalancePayload ? normalizeSamBalances(rawBalances) : [],
      error: wallet.error || null,
      balanceOk: hasBalancePayload && !wallet.error,
    };
  });
}

function mergeWalletRows(previous = [], next = []) {
  if (!next.length) return previous.length ? previous : next;
  if (!previous.length) return next;
  const prevByKey = new Map();
  previous.forEach((row) => {
    prevByKey.set(String(row.id || row.identifier || `${row.provider}:${row.label}`), row);
  });
  return next.map((row) => {
    const key = String(row.id || row.identifier || `${row.provider}:${row.label}`);
    const prev = prevByKey.get(key);
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

export function useAdminSamWallets(enabled, {
  autoFetch = true,
  cacheKey = null,
  staleAfterMs = DEFAULT_STALE_MS,
  pollIntervalMs = DEFAULT_POLL_MS,
} = {}) {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);
  const refreshInFlight = useRef(false);
  const lastGoodWallets = useRef([]);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setWallets([]);
      setError(null);
      setNotConfigured(false);
      setHasFetched(false);
      lastGoodWallets.current = [];
      return [];
    }
    if (refreshInFlight.current) return lastGoodWallets.current;

    refreshInFlight.current = true;
    if (!silent) {
      setLoading(true);
    }

    try {
      const data = await fetchAllSamWalletBalances();
      const rows = mergeWalletRows(lastGoodWallets.current, normalizeWalletRows(data.wallets));
      if (rows.some((w) => w.balanceOk || w.balances?.length)) {
        lastGoodWallets.current = rows;
      }
      setWallets(rows);
      setError(null);
      setNotConfigured(false);
      setHasFetched(true);
      if (cacheKey) {
        writeSamWalletsCache(cacheKey, { wallets: rows, notConfigured: false, error: null });
      }
      return rows;
    } catch (err) {
      const message = err.message || 'Failed to load Sam wallets';
      if (/not configured|api key/i.test(message)) {
        setNotConfigured(true);
        if (!silent) {
          setError(null);
          if (!lastGoodWallets.current.length) setWallets([]);
        }
        setHasFetched(true);
        if (cacheKey) {
          writeSamWalletsCache(cacheKey, { wallets: [], notConfigured: true, error: null });
        }
        return lastGoodWallets.current;
      }
      if (!silent) setError(message);
      if (lastGoodWallets.current.length) {
        setWallets(lastGoodWallets.current);
      } else if (!silent) {
        setWallets([]);
      }
      setHasFetched(true);
      if (cacheKey && !silent) {
        writeSamWalletsCache(cacheKey, {
          wallets: lastGoodWallets.current,
          notConfigured: false,
          error: message,
        });
      }
      return lastGoodWallets.current;
    } finally {
      refreshInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [enabled, cacheKey]);

  useEffect(() => {
    if (!enabled) {
      setWallets([]);
      setError(null);
      setNotConfigured(false);
      setHasFetched(false);
      setLoading(false);
      lastGoodWallets.current = [];
      return undefined;
    }

    if (cacheKey) {
      const cached = readSamWalletsCache(cacheKey);
      if (cached) {
        if (cached.wallets?.length) {
          lastGoodWallets.current = cached.wallets;
          setWallets(cached.wallets);
        }
        setError(cached.error);
        setNotConfigured(cached.notConfigured);
        setHasFetched(true);
      }
    }

    if (autoFetch) {
      refresh({ silent: lastGoodWallets.current.length > 0 });
    } else if (cacheKey) {
      const cached = readSamWalletsCache(cacheKey);
      if (cached && isWalletCacheStale(cached.fetchedAt, staleAfterMs)) {
        refresh({ silent: true });
      }
    }

    if (!pollIntervalMs || pollIntervalMs <= 0) return undefined;

    const timer = window.setInterval(() => {
      refresh({ silent: true });
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, autoFetch, cacheKey, staleAfterMs, pollIntervalMs, refresh]);

  return { wallets, loading, error, notConfigured, refresh, hasFetched };
}
