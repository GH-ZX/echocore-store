import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

/** Refresh + cache window (ms). All mounted tickers share one fetch. */
const CACHE_TTL_MS = 120_000;
let cached = { at: 0, rows: null };

/**
 * Anonymized social-proof feed: game name + minutes ago for recently fulfilled
 * orders (see RPC list_recent_purchase_activity). Never exposes users/amounts.
 */
export function useRecentPurchaseActivity({ limit = 6, enabled = true } = {}) {
  const [rows, setRows] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;

    const load = async () => {
      const now = Date.now();
      if (cached.rows && now - cached.at < CACHE_TTL_MS) {
        setRows(cached.rows);
        setReady(true);
        return;
      }
      try {
        const { data, error } = await supabase.rpc('list_recent_purchase_activity', {
          p_limit: limit,
        });
        if (cancelled || error) return;
        const list = Array.isArray(data) ? data : [];
        cached = { at: Date.now(), rows: list };
        setRows(list);
        setReady(true);
      } catch {
        /* keep last snapshot; ticker just hides itself */
      }
    };

    load();
    const timer = window.setInterval(load, CACHE_TTL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, limit]);

  return { rows, ready };
}
