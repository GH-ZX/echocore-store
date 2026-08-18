import { useEffect, useMemo, useState } from 'react';
import { checkOfferAffordability } from './g2bulk';

/**
 * Storefront "can't buy right now" indicator support.
 *
 * Queries the G2Bulk edge function for which offers the supplier wallet cannot
 * cover (only when the admin's wallet-low blocking toggle is ON), then marks
 * those cards with a red dot and disables their buy buttons. Results are cached
 * briefly so pages re-using the same offers don't hammer the edge function.
 */

const TTL_MS = 90_000;
const CHUNK = 200;
const cache = new Map(); // key: sorted unique ids → { at, promise }

function cacheKey(ids) {
  return [...new Set(ids.map(String))].sort().join(',');
}

async function fetchChunk(ids) {
  const res = await checkOfferAffordability({ offerIds: ids });
  return new Set((res?.unaffordableOfferIds || []).map(String));
}

/** Best-effort: resolves to a Set of unaffordable offer ids (never rejects). */
export function fetchUnaffordableOfferIds(offerIds = []) {
  const ids = [...new Set(offerIds.map(String).filter(Boolean))];
  if (!ids.length) return Promise.resolve(new Set());

  const key = cacheKey(ids);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;

  const promise = (async () => {
    const merged = new Set();
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = await fetchChunk(ids.slice(i, i + CHUNK));
      part.forEach((id) => merged.add(id));
    }
    return merged;
  })().catch(() => new Set()); // never block the store on this check

  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/**
 * @param {Array<{id?: string|number}>} offers
 * @returns {{ unaffordable: Set<string>, loaded: boolean }}
 */
export function useOfferAffordability(offers = []) {
  const ids = useMemo(
    () => (Array.isArray(offers) ? offers.map((o) => String(o?.id)).filter(Boolean) : []),
    [offers],
  );
  const key = cacheKey(ids);
  const [unaffordable, setUnaffordable] = useState(() => new Set());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!ids.length) {
      setLoaded(true);
      setUnaffordable(new Set());
      return undefined;
    }
    let cancelled = false;
    setLoaded(false);
    fetchUnaffordableOfferIds(ids).then((set) => {
      if (cancelled) return;
      setUnaffordable(set);
      setLoaded(true);
    });
    return () => { cancelled = true; };
    // key only changes when the offer id list changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { unaffordable, loaded };
}
