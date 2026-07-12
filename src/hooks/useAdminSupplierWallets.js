import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_STALE_MS,
  SUPPLIER_WALLETS_CACHE_KEY,
} from '../lib/adminSupplierWallets';
import {
  refreshSupplierWallets,
  registerSupplierWalletsWatcher,
  subscribeSupplierWallets,
} from '../lib/adminSupplierWalletsStore';

export function useAdminSupplierWallets(enabled, {
  cacheKey = SUPPLIER_WALLETS_CACHE_KEY,
  fetchOnMount = true,
  staleAfterMs = DEFAULT_STALE_MS,
  pollIntervalMs = 0,
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

  return {
    ...state,
    refresh,
  };
}