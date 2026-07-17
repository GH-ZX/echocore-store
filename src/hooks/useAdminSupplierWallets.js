import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_POLL_MS,
  DEFAULT_STALE_MS,
  SUPPLIER_WALLETS_CACHE_KEY,
} from '../lib/adminSupplierWallets';
import {
  refreshG2bulkWallet,
  refreshSamWallets,
  refreshSupplierWallets,
  registerSupplierWalletsWatcher,
  subscribeSupplierWallets,
} from '../lib/adminSupplierWalletsStore';

export function useAdminSupplierWallets(enabled, {
  cacheKey = SUPPLIER_WALLETS_CACHE_KEY,
  fetchOnMount = true,
  staleAfterMs = DEFAULT_STALE_MS,
  /** Default: auto-refresh every 1 minute while admin UI is mounted */
  pollIntervalMs = DEFAULT_POLL_MS,
} = {}) {
  const [state, setState] = useState(() => ({
    g2bulkWallet: null,
    g2bulkError: null,
    g2bulkFetched: false,
    samWallets: [],
    samError: null,
    samNotConfigured: false,
    samFetched: false,
    loading: false,
    g2bulkLoading: false,
    samLoading: false,
    idle: true,
    hasFetched: false,
  }));

  useEffect(() => {
    if (!enabled) return undefined;
    return subscribeSupplierWallets(setState);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    return registerSupplierWalletsWatcher(true, {
      cacheKey,
      fetchOnMount,
      staleAfterMs,
      pollIntervalMs,
    });
  }, [enabled, cacheKey, fetchOnMount, staleAfterMs, pollIntervalMs]);

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    return refreshSupplierWallets({ silent: false, key: cacheKey });
  }, [enabled, cacheKey]);

  const refreshG2bulk = useCallback(async () => {
    if (!enabled) return null;
    return refreshG2bulkWallet({ silent: false });
  }, [enabled]);

  const refreshSam = useCallback(async () => {
    if (!enabled) return null;
    return refreshSamWallets({ silent: false });
  }, [enabled]);

  return {
    ...state,
    refresh,
    refreshG2bulk,
    refreshSam,
  };
}
