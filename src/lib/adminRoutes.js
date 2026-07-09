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
};

export const ADMIN_SEGMENT_TO_TAB = Object.fromEntries(
  Object.entries(ADMIN_TAB_SEGMENTS).map(([tabId, segment]) => [segment, tabId]),
);

export function resolveAdminTabFromPath(pathname = '') {
  const parts = String(pathname).replace(/\/+$/, '').split('/').filter(Boolean);
  if (parts.length < 2 || parts[0] !== 'dashboard') return 'overview';
  if (parts.length === 1) return 'overview';
  const segment = parts[1];
  return ADMIN_SEGMENT_TO_TAB[segment] || 'overview';
}

export function getAdminDashboardPath(tabId = 'overview') {
  const segment = ADMIN_TAB_SEGMENTS[tabId];
  if (!segment || tabId === 'overview') return '/dashboard';
  return `/dashboard/${segment}`;
}

export function isAdminDashboardPath(pathname = '') {
  return String(pathname).startsWith('/dashboard');
}

export function isValidAdminTabSegment(segment = '') {
  return segment in ADMIN_SEGMENT_TO_TAB;
}