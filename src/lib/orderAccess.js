const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidOrderUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value.trim());
}

export function canUserAccessOrderReceipt(order, user) {
  if (!order || !user?.id) return false;
  if (user.role === 'admin') return true;
  return order.user_id === user.id;
}

const FULFILL_MARKER_PREFIX = 'echocore:may-fulfill:';

export function markOrderFulfillAllowed(orderId) {
  if (!orderId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(`${FULFILL_MARKER_PREFIX}${orderId}`, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/** Allow auto-fulfill only right after checkout in this tab — not from a bookmarked URL alone. */
export function consumeOrderFulfillMarker(orderId) {
  if (!orderId || typeof sessionStorage === 'undefined') return false;
  try {
    const key = `${FULFILL_MARKER_PREFIX}${orderId}`;
    const raw = sessionStorage.getItem(key);
    if (!raw) return false;
    sessionStorage.removeItem(key);
    const ts = parseInt(raw, 10);
    if (!Number.isFinite(ts)) return true;
    return Date.now() - ts < 30 * 60 * 1000;
  } catch {
    return false;
  }
}