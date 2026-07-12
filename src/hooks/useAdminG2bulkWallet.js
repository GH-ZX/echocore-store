import { useState, useEffect, useCallback, useRef } from 'react';
import { g2bulkGetMe } from '../lib/g2bulk';
import {
  isWalletCacheStale,
  readG2bulkWalletCache,
  writeG2bulkWalletCache,
} from '../lib/adminWalletCache';

const DEFAULT_STALE_MS = 3 * 60 * 1000;
const DEFAULT_POLL_MS = 3 * 60 * 1000;

export function useAdminG2bulkWallet(enabled, {
  autoFetch = true,
  cacheKey = null,
  staleAfterMs = DEFAULT_STALE_MS,
  pollIntervalMs = DEFAULT_POLL_MS,
} = {}) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasFetched, setHasFetched] = useState(false);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setWallet(null);
      setError(null);
      setHasFetched(false);
      return null;
    }
    if (refreshInFlight.current) return null;

    refreshInFlight.current = true;
    if (!silent) {
      setLoading(true);
      setError(null);
    }

    try {
      const me = await g2bulkGetMe();
      const next = {
        balance: Number(me.balance) || 0,
        username: me.username || me.first_name || '',
        userId: me.user_id ?? null,
      };
      setWallet(next);
      setError(null);
      setHasFetched(true);
      if (cacheKey) {
        writeG2bulkWalletCache(cacheKey, { wallet: next, error: null });
      }
      return next;
    } catch (err) {
      const message = err.message || 'Failed to load G2Bulk wallet';
      if (!silent) {
        setError(message);
        setWallet(null);
      }
      setHasFetched(true);
      if (cacheKey && !silent) {
        writeG2bulkWalletCache(cacheKey, { wallet: null, error: message });
      }
      return null;
    } finally {
      refreshInFlight.current = false;
      if (!silent) setLoading(false);
    }
  }, [enabled, cacheKey]);

  useEffect(() => {
    if (!enabled) {
      setWallet(null);
      setError(null);
      setHasFetched(false);
      setLoading(false);
      return undefined;
    }

    let hydrated = false;
    if (cacheKey) {
      const cached = readG2bulkWalletCache(cacheKey);
      if (cached) {
        setWallet(cached.wallet);
        setError(cached.error);
        setHasFetched(true);
        hydrated = true;
        if (cached.error && !cached.wallet) {
          /* keep error from last manual fetch */
        }
      }
    }

    if (autoFetch) {
      refresh();
      return undefined;
    }

    if (hydrated && cacheKey && isWalletCacheStale(readG2bulkWalletCache(cacheKey)?.fetchedAt, staleAfterMs)) {
      refresh({ silent: true });
    }

    if (!pollIntervalMs || pollIntervalMs <= 0) return undefined;

    const timer = window.setInterval(() => {
      refresh({ silent: true });
    }, pollIntervalMs);

    return () => window.clearInterval(timer);
  }, [enabled, autoFetch, cacheKey, staleAfterMs, pollIntervalMs, refresh]);

  return { wallet, loading, error, refresh, hasFetched };
}