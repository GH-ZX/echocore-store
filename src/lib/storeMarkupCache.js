import { fetchG2bulkSettings } from './g2bulk';

/** In-memory store default markup % for admin UI badges. */
let cached = null;
let inflight = null;

export function getCachedStoreMarkupPercent() {
  return cached;
}

function notifyMarkupListeners() {
  if (typeof window === 'undefined' || cached == null) return;
  window.dispatchEvent(new CustomEvent('echocore-store-markup-changed', { detail: cached }));
}

export function setCachedStoreMarkupPercent(value) {
  const n = Number(value);
  // Only cache real positive margins (0 was breaking badges site-wide)
  if (Number.isFinite(n) && n > 0) {
    cached = n;
    notifyMarkupListeners();
  }
}

/** Drop cache so next badge load re-reads DB (call after admin saves a new %). */
export function invalidateStoreMarkupPercent() {
  cached = null;
  inflight = null;
}

export async function ensureStoreMarkupPercent() {
  // Serve memory cache only when it is a real positive %
  if (cached != null && cached > 0) return cached;
  if (inflight) return inflight;
  inflight = fetchG2bulkSettings()
    .then((settings) => {
      const n = Number(settings?.g2bulk_markup_percent);
      if (Number.isFinite(n) && n > 0) {
        cached = n;
      } else if (cached == null || cached <= 0) {
        cached = 12;
      }
      return cached;
    })
    .catch(() => {
      if (cached == null || cached <= 0) cached = 12;
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}
