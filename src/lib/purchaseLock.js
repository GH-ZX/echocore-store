const LOCK_TTL_MS = 60_000;

function lockKey(userId) {
  return `echocore:purchase-lock:${userId}`;
}

/** Cross-tab checkout guard (best-effort; DB enforces the real limit). */
export function tryAcquirePurchaseLock(userId) {
  if (!userId || typeof localStorage === 'undefined') return true;

  try {
    const key = lockKey(userId);
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.ts && Date.now() - parsed.ts < LOCK_TTL_MS) {
        return false;
      }
    }
    localStorage.setItem(key, JSON.stringify({ ts: Date.now() }));
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
}