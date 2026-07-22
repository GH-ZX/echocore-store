const LOCK_TTL_MS = 90_000;
const MAX_CART_LINES = 20;

function lockKey(userId) {
  return `echocore:purchase-lock:${userId}`;
}

function tokenKey(userId) {
  return `echocore:checkout-token:${userId}`;
}

/** Random one-shot id for a single checkout / buy-now attempt. */
export function createCheckoutToken() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `chk-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Cross-tab + double-click guard (best-effort).
 * Same token may re-enter (safe retry after network blip).
 * Different token while lock is fresh → blocked.
 * Real enforcement remains DB: pg_advisory_xact_lock + balance FOR UPDATE.
 */
export function tryAcquirePurchaseLock(userId, token = null) {
  if (!userId || typeof localStorage === 'undefined') return true;

  try {
    const key = lockKey(userId);
    const raw = localStorage.getItem(key);
    const now = Date.now();

    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.ts && now - parsed.ts < LOCK_TTL_MS) {
        // Allow safe retry with the same checkout token only
        if (token && parsed.token && parsed.token === token) {
          return true;
        }
        return false;
      }
    }

    localStorage.setItem(key, JSON.stringify({ ts: now, token: token || null }));
    if (token) {
      try {
        sessionStorage.setItem(tokenKey(userId), token);
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return true;
  }
}

export function releasePurchaseLock(userId) {
  if (!userId || typeof localStorage === 'undefined') return;

  try {
    localStorage.removeItem(lockKey(userId));
  } catch {
    /* ignore */
  }
  try {
    sessionStorage.removeItem(tokenKey(userId));
  } catch {
    /* ignore */
  }
}

export function getMaxCartLines() {
  return MAX_CART_LINES;
}
