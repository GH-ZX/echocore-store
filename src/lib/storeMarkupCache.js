import { fetchG2bulkSettings } from './g2bulk';

/** In-memory store default markup % for admin UI badges. */
let cached = null;
let inflight = null;

export function getCachedStoreMarkupPercent() {
  return cached;
}

export function setCachedStoreMarkupPercent(value) {
  const n = Number(value);
  if (Number.isFinite(n) && n >= 0) cached = n;
}

export async function ensureStoreMarkupPercent() {
  if (cached != null) return cached;
  if (inflight) return inflight;
  inflight = fetchG2bulkSettings()
    .then((settings) => {
      const n = Number(settings?.g2bulk_markup_percent);
      cached = Number.isFinite(n) && n >= 0 ? n : 12;
      return cached;
    })
    .catch(() => {
      if (cached == null) cached = 12;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
