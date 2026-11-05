/** Milliseconds left until `expiresAt` (never negative), or null when unknown. */
export function msUntil(expiresAt, now = Date.now()) {
  const end = new Date(expiresAt).getTime();
  if (!Number.isFinite(end)) return null;
  return Math.max(0, end - now);
}

/** "mm:ss" for a payment window (rounded up, so 0:00 only once it has really ended). */
export function formatCountdown(ms) {
  if (ms == null || !Number.isFinite(ms)) return '';
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** 'ok' | 'soon' (under 3 minutes) | 'last' (under 1 minute). */
export function countdownTone(ms) {
  if (ms == null) return 'ok';
  if (ms < 60_000) return 'last';
  if (ms < 180_000) return 'soon';
  return 'ok';
}
