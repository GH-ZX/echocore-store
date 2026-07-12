import { isUuidLike, normalizeUsernameParam } from './username';

export const ADMIN_TAB_SEGMENTS = {
  overview: 'overview',
  home: 'home',
  products: 'products',
  orders: 'orders',
  payments: 'payments',
  g2bulk: 'g2bulk',
  recharges: 'recharges',
  theme: 'themes',
  reviews: 'reviews',
  devtools: 'devtools',
  users: 'users',
};

export const ADMIN_SEGMENT_TO_TAB = Object.fromEntries(
  Object.entries(ADMIN_TAB_SEGMENTS).map(([tabId, segment]) => [segment, tabId]),
);

export function resolveAdminTabFromPath(pathname = '') {
  const parts = String(pathname).replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'dashboard') return 'overview';
  if (parts.length === 1) return 'overview';
  const segment = parts[1];
  if (segment === ADMIN_TAB_SEGMENTS.users) return 'users';
  return ADMIN_SEGMENT_TO_TAB[segment] || 'overview';
}

export function resolveAdminUserRouteParamFromPath(pathname = '') {
  const parts = String(pathname).replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length === 3 && parts[0] === 'dashboard' && parts[1] === ADMIN_TAB_SEGMENTS.users) {
    try {
      return decodeURIComponent(parts[2]);
    } catch {
      return parts[2];
    }
  }
  return null;
}

/** @deprecated Use resolveAdminUserRouteParamFromPath — segment is username, not always a UUID. */
export function resolveAdminUserIdFromPath(pathname = '') {
  return resolveAdminUserRouteParamFromPath(pathname);
}

export function getAdminUserPath(username = '') {
  const raw = String(username || '').trim().replace(/^@+/, '');
  if (!raw) return getAdminDashboardPath('users');
  const slug = isUuidLike(raw) ? raw : normalizeUsernameParam(raw);
  return `/dashboard/users/${encodeURIComponent(slug)}`;
}

/** @deprecated Use getAdminUserPath(username) */
export function getAdminUserDetailPath(username = '') {
  return getAdminUserPath(username);
}

export function getAdminDashboardPath(tabId = 'overview') {
  const segment = ADMIN_TAB_SEGMENTS[tabId];
  if (!segment || tabId === 'overview') return '/dashboard';
  return `/dashboard/${segment}`;
}

export function getAdminOrdersPath({ username = '', orderId = '' } = {}) {
  const base = getAdminDashboardPath('orders');
  const params = new URLSearchParams();
  const normalizedUsername = normalizeUsernameParam(username);
  if (normalizedUsername) params.set('user', normalizedUsername);
  if (orderId) params.set('order', orderId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function isAdminDashboardPath(pathname = '') {
  return String(pathname).startsWith('/dashboard');
}

export function isValidAdminTabSegment(segment = '') {
  return segment in ADMIN_SEGMENT_TO_TAB;
}

export function getAdminGiftPath({ offerId = '', username = '', returnTo = '' } = {}) {
  const params = new URLSearchParams();
  if (offerId) params.set('offer', String(offerId));
  const normalizedUsername = normalizeUsernameParam(username);
  if (normalizedUsername) params.set('user', normalizedUsername);
  if (returnTo) params.set('return', returnTo);
  const query = params.toString();
  return query ? `/dashboard/gift?${query}` : '/dashboard/gift';
}

export function getAdminGiftReturnPath(returnParam = '', fallback = '/dashboard') {
  const raw = String(returnParam || '').trim();
  if (!raw) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//')) return fallback;
  return raw;
}