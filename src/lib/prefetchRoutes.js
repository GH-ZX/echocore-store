/**
 * Best-effort prefetch of lazy chunks during browser idle time.
 *
 * After the site's first paint, the browser is usually idle while the user
 * reads the home page — that's the perfect window to fetch the chunks for
 * the routes they're about to click. The first navigation then resolves from
 * cache instead of paying a fetch + parse round trip (which is why the first
 * page open felt slow while every later one felt instant).
 */

const prefetched = new Set();

/** Fire the raw import() for every factory once. Failures are non-fatal. */
export function prefetchRouteChunks(factories) {
  const entries = typeof factories === 'object' && factories !== null
    ? Object.values(factories)
    : [];
  for (const factory of entries) {
    if (typeof factory !== 'function' || prefetched.has(factory)) continue;
    prefetched.add(factory);
    Promise.resolve(factory()).catch(() => {
      /* prefetch is best-effort; the real lazy() call retries on demand */
    });
  }
}

/**
 * Schedule a prefetch for the next idle slot, with a hard cap so it always
 * runs even if the tab never goes idle (e.g. constant animation).
 */
export function scheduleRoutePrefetch(factories, { timeoutMs = 3000 } = {}) {
  if (typeof window === 'undefined') return;
  const run = () => prefetchRouteChunks(factories);
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(run, { timeout: timeoutMs });
  } else {
    window.setTimeout(run, Math.min(timeoutMs, 2000));
  }
}
