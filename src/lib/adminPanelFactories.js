/**
 * Single source of truth for lazily-loaded admin dashboard panels.
 *
 * AdminView.jsx wraps each factory with `lazyRetry()`; App.jsx preloads them
 * once an admin session resolves, so opening the dashboard (and its tabs,
 * e.g. the heavy AdminApisPage) doesn't pay a fetch+parse on first click.
 */
export const adminPanelFactories = {
  AdminPaymentsSettings: () => import('../components/admin/AdminPaymentsSettings'),
  AdminThemeSettings: () => import('../components/admin/AdminThemeSettings'),
  AdminHomeLayoutSettings: () => import('../components/admin/AdminHomeLayoutSettings'),
  AdminReviewsManager: () => import('../components/admin/AdminReviewsManager'),
  AdminRechargeManager: () => import('../components/admin/AdminRechargeManager'),
  AdminUsersManager: () => import('../components/admin/AdminUsersManager'),
  AdminPartnersManager: () => import('../components/admin/AdminPartnersManager'),
  AdminInboxManager: () => import('../components/admin/AdminInboxManager'),
  AdminContactMessages: () => import('../components/admin/AdminContactMessages'),
  AdminOrdersManager: () => import('../components/admin/AdminOrdersManager'),
  AdminProfitStatsPage: () => import('../components/admin/AdminProfitStatsPage'),
  AdminSiteLogs: () => import('../components/admin/AdminSiteLogs'),
  AdminApisPage: () => import('../components/admin/AdminApisPage'),
};
