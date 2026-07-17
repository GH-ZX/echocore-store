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
  users: 'users',
  inbox: 'inbox',
  contact: 'contact',
  logs: 'logs',
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
  if (segment === ADMIN_TAB_SEGMENTS.g2bulk) return 'products';
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

export const ADMIN_FOCUS_SYP_RATE_STATE = { focusSypRate: true };

export function getAdminPaymentsPath({ focusSypRate = false } = {}) {
  const base = getAdminDashboardPath('payments');
  return focusSypRate ? { pathname: base, state: ADMIN_FOCUS_SYP_RATE_STATE } : base;
}

export function getAdminSaleDiscountsPath() {
  return getAdminDashboardPath('products');
}

export const ADMIN_SALE_DISCOUNTS_FOCUS_STATE = { focusSaleDiscounts: true };

export function getAdminOrdersPath({ username = '', orderId = '' } = {}) {
  const base = getAdminDashboardPath('orders');
  const params = new URLSearchParams();
  const normalizedUsername = normalizeUsernameParam(username);
  if (normalizedUsername) params.set('user', normalizedUsername);
  if (orderId) params.set('order', orderId);
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

/**
 * Admin contact messages tab.
 * Always uses query `?message=` so deep-links work when React Router state is dropped
 * (notification bell, refresh, mobile, GH Pages).
 *
 * Returns a navigate-ready object: { pathname, search, state?, path }.
 * Prefer `path` (full string) for maximum RR compatibility.
 */
export function getAdminContactPath({ messageId = '' } = {}) {
  const base = getAdminDashboardPath('contact');
  const id = String(messageId || '').trim();
  if (!id) {
    return {
      path: base,
      pathname: base,
      search: '',
      state: undefined,
    };
  }
  const search = `?message=${encodeURIComponent(id)}`;
  return {
    path: `${base}${search}`,
    pathname: base,
    search,
    state: { highlightContactMessageId: id },
  };
}

/**
 * Normalize any destination shape into a React Router navigate target.
 * Accepts: string path, { path }, { pathname, search, state }.
 */
export function toNavigateTarget(dest) {
  if (!dest) return { pathname: '/' };

  if (typeof dest === 'string') {
    const q = dest.indexOf('?');
    if (q === -1) return { pathname: dest || '/' };
    return {
      pathname: dest.slice(0, q) || '/',
      search: dest.slice(q),
    };
  }

  // Prefer explicit pathname+search; fall back to path (may include query)
  let pathname = dest.pathname || '';
  let search = dest.search || '';
  const rawPath = dest.path || '';

  if (!pathname && rawPath) {
    const q = rawPath.indexOf('?');
    if (q === -1) {
      pathname = rawPath;
    } else {
      pathname = rawPath.slice(0, q);
      if (!search) search = rawPath.slice(q);
    }
  }

  if (pathname.includes('?')) {
    const q = pathname.indexOf('?');
    if (!search) search = pathname.slice(q);
    pathname = pathname.slice(0, q);
  }

  if (search && !search.startsWith('?')) search = `?${search}`;

  const target = { pathname: pathname || '/' };
  if (search) target.search = search;
  if (dest.state != null) target.state = dest.state;
  return target;
}

/** Call react-router navigate() with any destination shape. */
export function navigateTo(navigate, dest) {
  if (typeof navigate !== 'function') return;
  if (!dest) {
    navigate('/');
    return;
  }
  if (typeof dest === 'string') {
    navigate(dest);
    return;
  }
  // Prefer pre-built full path string when present (most reliable)
  if (typeof dest.path === 'string' && dest.path.startsWith('/')) {
    if (dest.state != null) {
      navigate(dest.path, { state: dest.state });
    } else {
      navigate(dest.path);
    }
    return;
  }
  const target = toNavigateTarget(dest);
  const { state, ...to } = target;
  const full = `${to.pathname || '/'}${to.search || ''}`;
  if (state != null) {
    navigate(full, { state });
    return;
  }
  navigate(full);
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