import { useState, useEffect, useCallback, useRef } from 'react';
import { g2bulkGetMe } from '../lib/g2bulk';
import { normalizeG2bulkWallet } from '../lib/g2bulkWalletFormat';
import {
  isWalletCacheStale,
  readG2bulkWalletCache,
  writeG2bulkWalletCache,
} from '../lib/adminWalletCache';

const DEFAULT_STALE_MS = 45 * 1000;
const DEFAULT_POLL_MS = 60 * 1000;

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
  const lastGoodWallet = useRef(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!enabled) {
      setWallet(null);
      setError(null);
      setHasFetched(false);
      lastGoodWallet.current = null;
      return null;
    }
    if (refreshInFlight.current) return lastGoodWallet.current;

    refreshInFlight.current = true;
    if (!silent) {
      setLoading(true);
      // Keep previous balance visible — do not clear to $0 while loading.
    }

    try {
      const me = await g2bulkGetMe();
      const next = normalizeG2bulkWallet(me);
      if (!next) {
        const message = 'G2Bulk returned no usable balance';
        if (!silent) setError(message);
        setHasFetched(true);
        // Keep last good wallet on screen
        if (lastGoodWallet.current) {
          setWallet(lastGoodWallet.current);
        }
        if (cacheKey && !silent) {
          writeG2bulkWalletCache(cacheKey, {
            wallet: lastGoodWallet.current,
            error: message,
          });
        }
        return lastGoodWallet.current;
      }
      lastGoodWallet.current = next;
      setWallet(next);
      setError(null);
      setHasFetched(true);
      if (cacheKey) {
        writeG2bulkWalletCache(cacheKey, { wallet: next, error: null });
      }
      return next;
    } catch (err) {
      const message = err.message || 'Failed to load G2Bulk wallet';
      if (!silent) setError(message);
      setHasFetched(true);
      if (lastGoodWallet.current) {
        setWallet(lastGoodWallet.current);
      } else if (!silent) {
        setWallet(null);
      }
      if (cacheKey && !silent) {
        writeG2bulkWalletCache(cacheKey, {
          wallet: lastGoodWallet.current,
          error: message,
        });
      }
      return lastGoodWallet.current;
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
      lastGoodWallet.current = null;
      return undefined;
    }

    if (cacheKey) {
      const cached = readG2bulkWalletCache(cacheKey);
      if (cached) {
        if (cached.wallet) {
          lastGoodWallet.current = cached.wallet;
          setWallet(cached.wallet);
        }
        setError(cached.error);
        setHasFetched(true);
      }
    }

    if (autoFetch) {
      refresh({ silent: !!lastGoodWallet.current });
    } else if (cacheKey) {
      const cached = readG2bulkWalletCache(cacheKey);
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

  return { wallet, loading, error, refresh, hasFetched };
}
