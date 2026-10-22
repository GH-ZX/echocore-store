/**
 * Stale-while-revalidate cache for the public storefront (catalog, home layout, settings).
 *
 * Repeat visits render from this cache immediately and refresh in the background, which
 * matters most on slow mobile links. Only PUBLIC data goes in here — callers must store
 * rows exactly as the anonymous API returns them (never admin wholesale/cost overlays).
 */

const PREFIX = 'echocore-sf:';
const VERSION = 1;
/** Entries older than this are ignored (the live fetch repopulates them). */
export const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Keep well under localStorage's ~5 MB quota. */
const MAX_ENTRY_CHARS = 1_500_000;

function getStorage() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function readStorefrontCache(key, { maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now() } = {}) {
  const storage = getStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || entry.v !== VERSION || typeof entry.t !== 'number') return null;
    if (now - entry.t > maxAgeMs) return null;
    return entry.d ?? null;
  } catch {
    return null;
  }
}

export function writeStorefrontCache(key, data, { now = Date.now() } = {}) {
  const storage = getStorage();
  if (!storage || data == null) return false;
  try {
    const payload = JSON.stringify({ v: VERSION, t: now, d: data });
    if (payload.length > MAX_ENTRY_CHARS) return false;
    storage.setItem(PREFIX + key, payload);
    return true;
  } catch {
    // Quota exceeded / private mode: the cache is an optimisation, never required.
    return false;
  }
}

export function clearStorefrontCache(key) {
  const storage = getStorage();
  if (!storage) return;
  try {
    if (key) storage.removeItem(PREFIX + key);
    else {
      Object.keys(storage)
        .filter((k) => k.startsWith(PREFIX))
        .forEach((k) => storage.removeItem(k));
    }
  } catch {
    // ignore
  }
}

/** Identifies which catalog a cache entry belongs to (mode, supplier filter, pull selection). */
export function catalogConfigKey(config = {}) {
  const mode = config?.g2bulkCatalogMode === 'live' ? 'live' : 'sync';
  const only = config?.g2bulkCatalogOnly === false ? 'all' : 'g2bulk';
  let pull;
  try {
    pull = JSON.stringify(config?.g2bulkPullSelection ?? null);
  } catch {
    pull = '';
  }
  return `${mode}|${only}|${pull}`;
}

/** True when two row lists are identical (used to skip pointless re-renders after a revalidate). */
export function sameRows(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

let memoCatalog;

/** Cached public catalog ({ games, offers, configKey }) or null. Memoised for the first render. */
export function readCachedCatalog() {
  if (memoCatalog !== undefined) return memoCatalog;
  const hit = readStorefrontCache('catalog');
  memoCatalog = hit && Array.isArray(hit.games) && Array.isArray(hit.offers) && hit.games.length > 0
    ? hit
    : null;
  return memoCatalog;
}

export function writeCachedCatalog({ games, offers, configKey }) {
  if (!Array.isArray(games) || !Array.isArray(offers) || games.length === 0) return false;
  return writeStorefrontCache('catalog', { games, offers, configKey });
}
