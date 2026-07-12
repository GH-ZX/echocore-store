import { useState, useEffect, useCallback, useRef } from 'react';
import { fetchAllSamWalletBalances } from '../lib/samApi';
import { normalizeSamBalances } from '../lib/samWalletFormat';
import {
  isWalletCacheStale,
  readSamWalletsCache,
  writeSamWalletsCache,
} from '../lib/adminWalletCache';

const DEFAULT_STALE_MS = 3 * 60 * 1000;
const DEFAULT_POLL_MS = 3 * 60 * 1000;

function normalizeWalletRows(wallets) {
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

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setWallets([]);
      setError(null);
      setNotConfigured(false);
      setHasFetched(false);
      return [];
    }
    if (refreshInFlight.current) return [];

    refreshInFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError(null);
      setNotConfigured(false);
    }

    try {
      const data = await fetchAllSamWalletBalances();
      const rows = normalizeWalletRows(data.wallets);
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
          setWallets([]);
          setError(null);
        }
        setHasFetched(true);
        if (cacheKey) {
          writeSamWalletsCache(cacheKey, { wallets: [], notConfigured: true, error: null });
        }
        return [];
      }
      if (!silent) {
        setError(message);
        setWallets([]);
        setNotConfigured(false);
      }
      setHasFetched(true);
      if (cacheKey && !silent) {
        writeSamWalletsCache(cacheKey, { wallets: [], notConfigured: false, error: message });
      }
      return [];
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
      return undefined;
    }

    let hydrated = false;
    if (cacheKey) {
      const cached = readSamWalletsCache(cacheKey);
      if (cached) {
        setWallets(cached.wallets);
        setError(cached.error);
        setNotConfigured(cached.notConfigured);
        setHasFetched(true);
        hydrated = true;
      }
    }

    if (autoFetch) {
      refresh();
      return undefined;
    }

    if (hydrated && cacheKey && isWalletCacheStale(readSamWalletsCache(cacheKey)?.fetchedAt, staleAfterMs)) {
      refresh({ silent: true });
    }

    if (!pollIntervalMs || pollIntervalMs <= 0) return undefined;

    const timer = window.setInterval(() => {
      refresh({ silent: true });
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, autoFetch, cacheKey, staleAfterMs, pollIntervalMs, refresh]);

  return { wallets, loading, error, notConfigured, refresh, hasFetched };
}