import { useState, useEffect, useCallback } from 'react';
import { g2bulkGetMe } from '../lib/g2bulk';

export function useAdminG2bulkWallet(enabled) {
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setWallet(null);
      setError(null);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const me = await g2bulkGetMe();
      const next = {
        balance: Number(me.balance) || 0,
        username: me.username || me.first_name || '',
        userId: me.user_id ?? null,
      };
      setWallet(next);
      return next;
    } catch (err) {
      setError(err.message || 'Failed to load G2Bulk wallet');
      setWallet(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { wallet, loading, error, refresh };
}