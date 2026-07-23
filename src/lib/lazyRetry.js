import { lazy } from 'react';

/**
 * React.lazy with one retry — fixes common Vite/HMR errors:
 * "Failed to fetch dynamically imported module: …/AdminView.jsx?t=…"
 * after dev-server restarts or hot updates invalidate the chunk.
 */
export function lazyRetry(factory, { retries = 1, delayMs = 200 } = {}) {
  return lazy(async () => {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await factory();
      } catch (err) {
        lastError = err;
        const msg = String(err?.message || err || '');
        const isChunkLoad = /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg);
        if (!isChunkLoad || attempt === retries) break;
        await new Promise((r) => setTimeout(r, delayMs));
        // Bust stale Vite query cache by full reload only as last resort on second fail — caller ErrorBoundary handles UI
      }
    }
    throw lastError;
  });
}

export function isDynamicImportError(error) {
  const msg = String(error?.message || error || '');
  return /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/i.test(msg);
}
