import { lazy } from 'react';

const CHUNK_RE =
  /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed|error loading dynamically imported module/i;

const RELOAD_KEY = 'echocore-chunk-reload';
const RELOAD_AT_KEY = 'echocore-chunk-reload-at';

export function isDynamicImportError(error) {
  const msg = String(error?.message || error || '');
  return CHUNK_RE.test(msg);
}

/**
 * After a new deploy, old tabs still reference deleted hashed chunks (404).
 * One full reload pulls fresh index.html + correct asset names.
 */
export function reloadOnceForStaleChunk() {
  if (typeof window === 'undefined') return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    // Don't loop: max one auto-reload per 30s
    if (last && Date.now() - last < 30_000) return false;
    sessionStorage.setItem(RELOAD_KEY, '1');
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

/** Call on successful app boot so the next deploy can auto-reload again. */
export function clearChunkReloadGuard() {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(RELOAD_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * React.lazy with retry + production reload for stale deploy chunks.
 */
export function lazyRetry(factory, { retries = 1, delayMs = 250 } = {}) {
  return lazy(async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        if (!isDynamicImportError(err) || attempt === retries) break;
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    // After retries: force once reload (prod stale hash or Vite HMR)
    if (isDynamicImportError(lastError)) {
      reloadOnceForStaleChunk();
    }
    throw lastError;
  });
}
