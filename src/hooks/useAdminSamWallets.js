import { useState, useEffect, useCallback } from 'react';
import { fetchAllSamWalletBalances } from '../lib/samApi';
import { normalizeSamBalances } from '../lib/samWalletFormat';

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

export function useAdminSamWallets(enabled) {
  const [wallets, setWallets] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setWallets([]);
      setError(null);
      setNotConfigured(false);
      return [];
    }

    setLoading(true);
    setError(null);
    setNotConfigured(false);

    try {
      const data = await fetchAllSamWalletBalances();
      const rows = normalizeWalletRows(data.wallets);
      setWallets(rows);
      return rows;
    } catch (err) {
      const message = err.message || 'Failed to load Sam wallets';
      if (/not configured|api key/i.test(message)) {
        setNotConfigured(true);
        setWallets([]);
        setError(null);
        return [];
      }
      setError(message);
      setWallets([]);
      return [];
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { wallets, loading, error, notConfigured, refresh };
}