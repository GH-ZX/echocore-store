import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  getAdminApisPath,
  getAdminDashboardPath,
  isValidAdminApisSection,
  isValidAdminTabSegment,
  resolveAdminTabFromPath,
} from '../../lib/adminRoutes';
import { Trash2, BarChart3, Package, ShoppingCart, Edit, Wallet, Palette, LayoutGrid, MessageSquare, CircleDollarSign, Percent, PanelLeftClose, PanelLeftOpen, Users, ScrollText, Bell, Mail, TrendingUp, Cable, Settings, Handshake } from 'lucide-react';
import { supabase } from '../../lib/supabase';

import { centerActiveMobileTab, resetPageHorizontalScroll } from '../../lib/adminMobileNav';
import { formatMessage, formatMoney } from '../../lib/i18n';
import { getCatalogOfferStats } from '../../lib/catalogUtils';
import { matchesAdminActivityFilter } from '../../lib/inboxFilters';
import AdminOverviewPanel from '../../components/admin/AdminOverviewPanel';
import { useAdminSupplierWallets } from '../../hooks/useAdminSupplierWallets';
import { useNotify } from '../../hooks/useNotify';
import AdminExistingGamesList from '../../components/admin/AdminExistingGamesList';
import AdminSaleDiscountsManager from '../../components/admin/AdminSaleDiscountsManager';
import AdminGameEditModal from '../../components/admin/AdminGameEditModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { lazyRetry } from '../../lib/lazyRetry';
import { adminPanelFactories } from '../../lib/adminPanelFactories';
const AdminPaymentsSettings = lazyRetry(adminPanelFactories.AdminPaymentsSettings);
const AdminThemeSettings = lazyRetry(adminPanelFactories.AdminThemeSettings);
const AdminHomeLayoutSettings = lazyRetry(adminPanelFactories.AdminHomeLayoutSettings);
const AdminReviewsManager = lazyRetry(adminPanelFactories.AdminReviewsManager);
const AdminRechargeManager = lazyRetry(adminPanelFactories.AdminRechargeManager);
const AdminUsersManager = lazyRetry(adminPanelFactories.AdminUsersManager);
const AdminPartnersManager = lazyRetry(adminPanelFactories.AdminPartnersManager);
const AdminInboxManager = lazyRetry(adminPanelFactories.AdminInboxManager);
const AdminContactMessages = lazyRetry(adminPanelFactories.AdminContactMessages);
const AdminOrdersManager = lazyRetry(adminPanelFactories.AdminOrdersManager);
const AdminProfitStatsPage = lazyRetry(adminPanelFactories.AdminProfitStatsPage);
const AdminSiteLogs = lazyRetry(adminPanelFactories.AdminSiteLogs);
const AdminApisPage = lazyRetry(adminPanelFactories.AdminApisPage);

function AdminTabLoader() {
  return (
    <div className="space-y-4 animate-pulse" role="status" aria-label="Loading">
      <div className="h-9 w-48 bg-[var(--border)] rounded-lg" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="card h-28 bg-[var(--bg-surface)]" />
        ))}
      </div>
      <div className="card h-64 bg-[var(--bg-surface)]" />
    </div>
  );
}

const ADMIN_SIDEBAR_KEY = 'echocore-admin-sidebar-collapsed';

function readSidebarCollapsed() {
  try {
    return localStorage.getItem(ADMIN_SIDEBAR_KEY) === '1';
  } catch {
    return false;
  }
}

function buildAdminNavItems(t) {
  // Fixed default order (sidebar + mobile tabs)
  return [
    { id: 'overview', label: t.overview, shortLabel: t.tabOverviewShort, icon: BarChart3 },
    { id: 'users', label: t.usersTab, shortLabel: t.tabUsersShort, icon: Users },
    { id: 'products', label: t.gamesAndOffers, shortLabel: t.tabGamesShort, icon: Package },
    { id: 'home', label: t.homeLayoutTab, shortLabel: t.tabHomeShort, icon: LayoutGrid },
    { id: 'profits', label: t.profitsTab, shortLabel: t.tabProfitsShort, icon: TrendingUp },
    { id: 'theme', label: t.themeTab, shortLabel: t.tabThemeShort, icon: Palette },
    { id: 'orders', label: t.ordersTab, shortLabel: t.tabOrdersShort, icon: ShoppingCart },
    { id: 'inbox', label: t.adminInboxTab, shortLabel: t.tabInboxShort, icon: Bell },
    { id: 'recharges', label: t.rechargesTab, shortLabel: t.tabRechargesShort, icon: CircleDollarSign },
    { id: 'payments', label: t.paymentsTab, shortLabel: t.tabPaymentsShort, icon: Wallet },
    { id: 'contact', label: t.adminContactTab, shortLabel: t.tabContactShort, icon: Mail },
    { id: 'reviews', label: t.reviewsTab, shortLabel: t.tabReviewsShort, icon: MessageSquare },
    { id: 'apis', label: t.apisTab, shortLabel: t.tabApisShort, icon: Cable },
    { id: 'partners', label: t.partnersTab, shortLabel: t.tabPartnersShort, icon: Handshake },
    { id: 'logs', label: t.logsTab, shortLabel: t.tabLogsShort, icon: ScrollText },
  ];
}

/**
 * Nav groups: 5 top-level entries instead of 14 tabs.
 * URLs are unchanged — groups only organize the existing tabs.
 */
function buildAdminNavGroups(t) {
  return [
    { id: 'insights', label: t.adminGroupOverview, shortLabel: t.tabOverviewShort, icon: BarChart3, tabs: ['overview', 'profits', 'logs'] },
    { id: 'sales', label: t.adminGroupSales, shortLabel: t.adminGroupSales, icon: ShoppingCart, tabs: ['orders'] },
    { id: 'catalog', label: t.adminGroupCatalog, shortLabel: t.adminGroupCatalog, icon: Package, tabs: ['products', 'home'] },
    { id: 'customers', label: t.adminGroupCustomers, shortLabel: t.adminGroupCustomers, icon: Users, tabs: ['users', 'partners', 'inbox', 'contact', 'reviews', 'recharges'] },
    { id: 'settings', label: t.adminGroupSettings, shortLabel: t.adminGroupSettings, icon: Settings, tabs: ['payments', 'apis', 'theme'] },
  ];
}

export default function AdminView({ 
  t, 
  lang, 
  games = [],
  offers = [],
  orders = [], 
  loadingOrders = false,
  updateProduct,
  deleteProduct,
  deleteGame: deleteGameProp,
  updateGame,
  saveGame: _saveGame,
  refreshProducts,
  refreshOffers,
  refreshOrders,
  onPaymentSettingsSaved,
  onCatalogSynced,
  onThemeSaved,
  onHomeLayoutSaved,
  reviews = [],
  onReviewsChanged,
  onNotify,
  onRechargeApproved,
  onApproveOrder: _onApproveOrder,
  onRejectOrder: _onRejectOrder,
  onFulfillOrder,
  paymentConfig = {},
  onDevBalanceCredited: _onDevBalanceCredited,
  onPreviewHomepage,
  notifications = [],
  unreadCount = 0,
  notificationsLoading = false,
  onRefreshInbox,
  onNotificationMarkRead,
  onNotificationsMarkAllRead,
  refreshSiteStatus,
}) {
  const { notifyError, notifySuccess } = useNotify(onNotify);
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = useMemo(() => resolveAdminTabFromPath(location.pathname), [location.pathname]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const adminNavItems = useMemo(() => buildAdminNavItems(t), [t]);
  const adminNavGroups = useMemo(() => buildAdminNavGroups(t), [t]);
  const activeNavItem = useMemo(
    () => adminNavItems.find((item) => item.id === activeTab) || adminNavItems[0],
    [adminNavItems, activeTab],
  );
  const activeGroup = useMemo(
    () => adminNavGroups.find((group) => group.tabs.includes(activeTab)) || adminNavGroups[0],
    [adminNavGroups, activeTab],
  );
  const groupSubTabs = useMemo(
    () => activeGroup.tabs
      .map((tabId) => adminNavItems.find((item) => item.id === tabId))
      .filter(Boolean),
    [activeGroup, adminNavItems],
  );
  const mobileNavRef = useRef(null);
  // Remember the last visited tab per group so switching groups restores it
  const lastTabPerGroupRef = useRef({});

  useEffect(() => {
    if (activeGroup.tabs.includes(activeTab)) {
      lastTabPerGroupRef.current[activeGroup.id] = activeTab;
    }
  }, [activeGroup, activeTab]);

  const setAdminTab = (tabId) => {
    resetPageHorizontalScroll();
    navigate(getAdminDashboardPath(tabId));
  };

  const openGroup = (group) => {
    const remembered = lastTabPerGroupRef.current[group.id];
    setAdminTab(group.tabs.includes(remembered) ? remembered : group.tabs[0]);
  };

  useEffect(() => {
    const legacyTab = location.state?.adminTab;
    if (!legacyTab) return;
    navigate(getAdminDashboardPath(legacyTab), { replace: true, state: null });
  }, [location.state?.adminTab, navigate]);

  useEffect(() => {
    const parts = location.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
    if (parts[0] !== 'dashboard' || parts.length < 2) return;
    if (parts.length === 3 && parts[1] === 'users') return;
    // /dashboard/apis/:section — valid nested API section
    if (parts.length === 3 && parts[1] === 'apis' && isValidAdminApisSection(parts[2])) return;
    // Invalid nested apis path → hub root
    if (parts.length >= 3 && parts[1] === 'apis') {
      navigate(getAdminApisPath(), { replace: true });
      return;
    }
    if (parts[1] === 'g2bulk') {
      navigate(getAdminApisPath({ section: 'g2bulk' }), { replace: true });
      return;
    }
    if (parts[1] === 'devtools') {
      navigate('/dashboard', { replace: true });
      return;
    }
    if (!isValidAdminTabSegment(parts[1])) {
      navigate('/dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);

  useEffect(() => {
    resetPageHorizontalScroll();
    const root = mobileNavRef.current;
    if (!root) return undefined;
    const frame = window.requestAnimationFrame(() => {
      centerActiveMobileTab(root);
      resetPageHorizontalScroll();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab]);

  useEffect(() => {
    if (activeTab !== 'products' || !location.state?.focusSaleDiscounts) return undefined;

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('admin-sale-discounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    navigate(location.pathname, { replace: true, state: null });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, location.pathname, location.state?.focusSaleDiscounts, navigate]);

  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [saleDiscountEditId, setSaleDiscountEditId] = useState(null);

  const [gameModal, setGameModal] = useState(null);

  // Filter offers list by game
  const [filterGameId, setFilterGameId] = useState('');

  // Quick lookup for game names in offers list
  const gamesMap = Object.fromEntries(games.map(g => [g.id, g]));

  const filteredOffersForList = filterGameId
    ? offers.filter(o => o.game_id === filterGameId) 
    : offers;

  useEffect(() => {
    try {
      localStorage.setItem(ADMIN_SIDEBAR_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  const handleSaveGame = async (gameData) => {
    // Games are created only via G2Bulk sync — edit existing rows only
    if (!gameData?.id) {
      throw new Error(t.adminGamesFromG2bulkOnly || 'Games are added only via G2Bulk catalog sync.');
    }
    const payload = { ...gameData, active: true };
    if (updateGame) {
      await updateGame(payload);
    } else {
      const { error } = await supabase
        .from('games')
        .update(payload)
        .eq('id', gameData.id);
      if (error) throw error;
    }
    notifySuccess(t.gameUpdatedSuccess);
    if (refreshProducts) await refreshProducts();
    if (refreshOffers) await refreshOffers();
  };

  const requestDeleteGame = (gameId) => {
    setConfirmAction({
      title: t.deleteGame,
      message: t.deleteGameConfirm,
      onConfirm: async () => {
        try {
          if (deleteGameProp) {
            await deleteGameProp(gameId);
          } else {
            const { error } = await supabase.from('games').delete().eq('id', gameId);
            if (error) throw error;
            if (refreshProducts) await refreshProducts();
            if (refreshOffers) await refreshOffers();
          }
          if (gameModal?.id === gameId) setGameModal(null);
          setConfirmAction(null);
        } catch (err) {
          console.error('Delete game error:', err);
          notifyError(`${t.failedToDeleteGame}: ${err.message || err}`);
        }
      },
    });
  };

  const requestDeleteOffer = (offerId) => {
    setConfirmAction({
      title: t.delete,
      message: t.deleteOfferConfirm,
      onConfirm: async () => {
        try {
          await deleteProduct(offerId);
          setConfirmAction(null);
        } catch (err) {
          console.error('Delete offer error:', err);
          notifyError(`${t.failedToDelete}: ${err.message || err}`);
        }
      },
    });
  };

  const handleConfirmAction = async () => {
    if (!confirmAction?.onConfirm) return;
    setConfirmLoading(true);
    try {
      await confirmAction.onConfirm();
    } finally {
      setConfirmLoading(false);
    }
  };



  const scrollToSaleDiscounts = (offerId = null) => {
    if (offerId) setSaleDiscountEditId(offerId);
    requestAnimationFrame(() => {
      document.getElementById('admin-sale-discounts')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const {
    g2bulkWallet,
    g2bulkError,
    g2bulkFetched,
    samWallets,
    samError,
    samNotConfigured,
    samFetched,
    loading: supplierWalletsLoading,
    refresh: refreshSupplierWallets,
  } = useAdminSupplierWallets(true, { fetchOnMount: true });

  const catalogStats = useMemo(
    () => getCatalogOfferStats(offers, games),
    [offers, games],
  );
  const totalOrders = orders.length;
  const totalRevenue = orders
    .filter((order) => order.status === 'completed' && order.payment_method !== 'admin_gift')
    .reduce((sum, order) => sum + parseFloat(order.total || 0), 0)
    .toFixed(2);
  const inboxUnreadCount = useMemo(
    () => notifications.filter((item) => !item.read_at && matchesAdminActivityFilter(item)).length,
    [notifications],
  );

  return (
    <div
      className={`admin-shell admin-layout mt-2 sm:mt-6 animate-fade-in${sidebarCollapsed ? ' admin-layout--collapsed' : ''}${lang === 'ar' ? ' admin-shell--rtl' : ''}`}
      dir={lang === 'ar' ? 'rtl' : 'ltr'}
      lang={lang}
    >
      <aside
        className={`admin-sidebar hidden md:flex${sidebarCollapsed ? ' admin-sidebar--collapsed' : ''}`}
        aria-label={t.adminNavLabel}
      >
        <button
          type="button"
          onClick={() => setSidebarCollapsed((value) => !value)}
          className="admin-sidebar__toggle"
          aria-expanded={!sidebarCollapsed}
          title={sidebarCollapsed ? t.expandSidebar : t.collapseSidebar}
        >
          {sidebarCollapsed
            ? <PanelLeftOpen className="w-4 h-4" />
            : <PanelLeftClose className="w-4 h-4" />}
          {!sidebarCollapsed && (
            <span className="admin-sidebar__toggle-label">
              {t.collapseShort}
            </span>
          )}
        </button>

        <nav className="admin-sidebar__nav">
          {adminNavGroups.map((group) => {
            const Icon = group.icon;
            const isActive = activeGroup.id === group.id;
            const showInboxBadge = group.tabs.includes('inbox') && inboxUnreadCount > 0;
            const groupTabs = isActive && !sidebarCollapsed
              ? group.tabs.map((tabId) => adminNavItems.find((item) => item.id === tabId)).filter(Boolean)
              : [];
            return (
              <div key={group.id} className="admin-nav-group">
                <button
                  type="button"
                  onClick={() => openGroup(group)}
                  className={`admin-nav-btn${isActive ? ' admin-nav-btn--active' : ''}`}
                  title={sidebarCollapsed ? group.label : undefined}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="admin-nav-btn__icon" aria-hidden="true" />
                  <span className="admin-nav-btn__label">{group.label}</span>
                  {showInboxBadge ? (
                    <span className="admin-nav-badge" aria-label={formatMessage(t.adminInboxUnreadActivity, { count: inboxUnreadCount })}>
                      {inboxUnreadCount > 9 ? '9+' : inboxUnreadCount}
                    </span>
                  ) : null}
                </button>
                {groupTabs.length > 1 && (
                  <div className="admin-nav-group__tabs">
                    {groupTabs.map((tab) => {
                      const TabIcon = tab.icon;
                      const isTabActive = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setAdminTab(tab.id)}
                          className={`admin-nav-subbtn${isTabActive ? ' admin-nav-subbtn--active' : ''}`}
                          aria-current={isTabActive ? 'page' : undefined}
                        >
                          <TabIcon className="admin-nav-subbtn__icon" aria-hidden="true" />
                          <span>{tab.label}</span>
                          {tab.id === 'inbox' && inboxUnreadCount > 0 ? (
                            <span className="admin-nav-badge admin-nav-badge--subtab">
                              {inboxUnreadCount > 9 ? '9+' : inboxUnreadCount}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <div className="admin-main">
        <nav
          ref={mobileNavRef}
          className="admin-mobile-nav flex md:hidden"
          aria-label={t.adminNavLabel}
        >
          {adminNavGroups.map((group) => {
            const Icon = group.icon;
            const isActive = activeGroup.id === group.id;
            const showInboxBadge = group.tabs.includes('inbox') && inboxUnreadCount > 0;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => openGroup(group)}
                className={`admin-mobile-tab admin-mobile-tab--group${isActive ? ' admin-mobile-tab--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                title={group.label}
              >
                <Icon className="admin-mobile-tab__icon" aria-hidden="true" />
                <span className="admin-mobile-tab__label">{group.shortLabel || group.label}</span>
                {showInboxBadge ? (
                  <span className="admin-nav-badge admin-nav-badge--mobile">
                    {inboxUnreadCount > 9 ? '9+' : inboxUnreadCount}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>

        {groupSubTabs.length > 1 && (
          <nav className="admin-subtabs md:hidden" aria-label={activeGroup.label}>
            {groupSubTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setAdminTab(tab.id)}
                  className={`admin-subtab${isActive ? ' admin-subtab--active' : ''}`}
                  aria-current={isActive ? 'page' : undefined}
                >
                  <Icon className="admin-subtab__icon" aria-hidden="true" />
                  <span className="admin-subtab__label">{tab.shortLabel || tab.label}</span>
                  {tab.id === 'inbox' && inboxUnreadCount > 0 ? (
                    <span className="admin-nav-badge admin-nav-badge--subtab">
                      {inboxUnreadCount > 9 ? '9+' : inboxUnreadCount}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </nav>
        )}

        <header className="admin-page-header mb-4 sm:mb-6">
          <p className="text-[10px] sm:hidden font-semibold uppercase tracking-wider text-[var(--accent)] mb-0.5">
            {t.adminDashboard} · {activeGroup.label}
          </p>
          <h1 className="text-xl sm:text-3xl font-black truncate">
            {activeNavItem?.label || t.adminDashboard}
          </h1>
          {activeTab === 'overview' || activeTab === 'profits' || activeTab === 'apis' ? (
            <p className="text-xs sm:text-base text-[var(--text-sec)] mt-0.5 sm:mt-0">
              {activeTab === 'overview'
                ? t.manageYourStore
                : activeTab === 'profits'
                  ? t.adminProfitStatsSubtitle
                  : t.apisPageDesc}
            </p>
          ) : null}
        </header>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <AdminOverviewPanel
          t={t}
          lang={lang}
          navigate={navigate}
          setAdminTab={setAdminTab}
          catalogStats={catalogStats}
          totalOrders={totalOrders}
          totalRevenue={totalRevenue}
          orders={orders}
          offers={offers}
          games={games}
          g2bulkWallet={g2bulkWallet}
          g2bulkError={g2bulkError}
          g2bulkFetched={g2bulkFetched}
          samWallets={samWallets}
          samError={samError}
          samNotConfigured={samNotConfigured}
          samFetched={samFetched}
          supplierWalletsLoading={supplierWalletsLoading}
          refreshSupplierWallets={refreshSupplierWallets}
          paymentConfig={paymentConfig}
        />
      )}

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <div className="card p-4 sm:p-5 border-[var(--accent)]/20">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <h3 className="font-bold text-sm sm:text-base flex items-center gap-2">
                  <Cable className="w-4 h-4 text-[var(--accent)] shrink-0" />
                  {t.apisProductsHintTitle}
                </h3>
                <p className="text-xs text-[var(--text-sec)] mt-1 leading-relaxed">
                  {t.apisProductsHintDesc}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAdminTab('apis')}
                className="btn btn-secondary text-xs py-2 px-3 shrink-0 self-start sm:self-center"
              >
                {t.apisOpenHub}
              </button>
            </div>
          </div>

          <AdminSaleDiscountsManager
            t={t}
            lang={lang}
            games={games}
            offers={offers}
            updateProduct={updateProduct}
            onNotify={onNotify}
            presetEditOfferId={saleDiscountEditId}
            onPresetEditConsumed={() => setSaleDiscountEditId(null)}
          />

          <div className="admin-products-divider" role="separator">
            <span className="admin-products-divider__line" aria-hidden="true" />
            <span className="admin-products-divider__label">{t.gamesAndOffers}</span>
            <span className="admin-products-divider__line" aria-hidden="true" />
          </div>

          <div className="card p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="text-lg sm:text-xl font-bold flex items-center gap-2">
                  <Package className="w-5 h-5 text-[var(--accent)]" />
                  {t.gamesAndOffers}
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  {t.adminGamesFromG2bulkOnly || t.englishNameOnlyHelp}
                </p>
              </div>
            </div>
            <AdminExistingGamesList
              games={games}
              offers={offers}
              lang={lang}
              t={t}
              editingGameId={gameModal?.id}
              onEdit={(game) => game?.id && setGameModal(game)}
              onDelete={requestDeleteGame}
            />
          </div>

          <div className="admin-products-divider" role="separator" aria-label={t.offersSectionAria}>
            <span className="admin-products-divider__line" aria-hidden="true" />
            <span className="admin-products-divider__label">
              {t.offersSectionDivider}
            </span>
            <span className="admin-products-divider__line" aria-hidden="true" />
          </div>

          <div className="card p-4 sm:p-6">
            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/50 p-4 mb-5 space-y-3">
              <p className="text-sm text-[var(--text-sec)] leading-relaxed">{t.adminOffersCatalogHelp}</p>
              <button
                type="button"
                onClick={() => scrollToSaleDiscounts()}
                className="action-chip gap-2 text-sm"
              >
                <Percent className="w-4 h-4" />
                {t.adminOffersGoToDiscounts}
              </button>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="min-w-0">
                <span className="font-bold">{filteredOffersForList.length} {t.offersCount}</span>
                {filterGameId && <span className="text-xs text-[var(--text-sec)] ml-2">{t.filtered}</span>}
              </div>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                <select 
                  value={filterGameId} 
                  onChange={e => setFilterGameId(e.target.value)}
                  className="input text-xs py-2 w-full sm:w-auto min-w-0"
                >
                  <option value="">{t.allGamesOption}</option>
                  {games.map(g => (
                    <option key={g.id} value={g.id}>{lang === 'ar' ? g.name_ar : g.name_en}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
              {filteredOffersForList.length > 0 ? (
                filteredOffersForList.map(offer => {
                  const game = gamesMap[offer.game_id];
                  const img = offer.sale_image_url || offer.image_url;
                  return (
                    <div key={offer.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[var(--bg-primary)] rounded-2xl border border-[var(--border)] hover:border-[var(--accent)]/40 group">
                      {img && (
                        <img 
                          src={img} 
                          alt="" 
                          className="w-12 h-12 object-cover rounded-xl flex-shrink-0 border border-[var(--border)]" 
                          onError={(e) => e.currentTarget.style.display = 'none'} 
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{lang === 'ar' ? offer.name_ar : offer.name_en}</div>
                        <div className="text-xs text-[var(--text-muted)] flex gap-2 flex-wrap">
                          {game && <span className="text-[var(--accent)]">{lang === 'ar' ? game.name_ar : game.name_en}</span>}
                          {offer.is_sale && offer.original_price ? (
                            <>
                              <span className="line-through">{formatMoney(offer.original_price)}</span>
                              <span className="font-semibold text-red-400">{formatMoney(offer.price)}</span>
                            </>
                          ) : (
                            <span>{formatMoney(offer.price)}</span>
                          )}
                          {offer.is_sale && <span className="px-1 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px]">{t.sale}</span>}
                          {offer.amount && <span>{offer.amount} {game?.points_name}</span>}
                          {offer.region && <span>• {offer.region}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 self-end sm:self-auto opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                        {offer.is_sale && (
                          <button
                            type="button"
                            onClick={() => scrollToSaleDiscounts(offer.id)}
                            className="p-2 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-xl"
                            title={t.adminOffersEditDiscount}
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        <button 
                          onClick={() => requestDeleteOffer(offer.id)}
                          className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-[var(--text-sec)]">
                  {t.noOffersYetSyncG2bulk || t.noOffersYetAddGame}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminOrdersManager
            t={t}
            lang={lang}
            orders={orders}
            loadingOrders={loadingOrders}
            refreshOrders={refreshOrders}
            onNotify={onNotify}
            onFulfillOrder={onFulfillOrder}
          />
        </Suspense>
      )}

      {activeTab === 'profits' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminProfitStatsPage
            t={t}
            lang={lang}
            orders={orders}
            offers={offers}
            games={games}
            loadingOrders={loadingOrders}
          />
        </Suspense>
      )}

      {activeTab === 'apis' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminApisPage
            t={t}
            lang={lang}
            onCatalogSynced={onCatalogSynced}
            onPaymentSettingsSaved={onPaymentSettingsSaved}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'payments' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminPaymentsSettings
            t={t}
            lang={lang}
            onSaved={onPaymentSettingsSaved}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'recharges' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminRechargeManager
            t={t}
            lang={lang}
            onNotify={onNotify}
            onApproved={onRechargeApproved}
            paymentConfig={paymentConfig}
          />
        </Suspense>
      )}

      {activeTab === 'theme' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminThemeSettings
            t={t}
            lang={lang}
            onSaved={onThemeSaved}
          />
        </Suspense>
      )}

      {activeTab === 'home' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminHomeLayoutSettings
            t={t}
            lang={lang}
            games={games}
            offers={offers}
            reviews={reviews}
            onSaved={onHomeLayoutSaved}
            onPreviewHomepage={onPreviewHomepage}
          />
        </Suspense>
      )}

      {activeTab === 'reviews' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminReviewsManager
            t={t}
            onChanged={onReviewsChanged}
          />
        </Suspense>
      )}

      {activeTab === 'users' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminUsersManager
            t={t}
            lang={lang}
            onNotify={onNotify}
            onSiteStatusChanged={refreshSiteStatus}
          />
        </Suspense>
      )}

      {activeTab === 'partners' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminPartnersManager
            t={t}
            lang={lang}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'inbox' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminInboxManager
            t={t}
            lang={lang}
            notifications={notifications}
            unreadCount={unreadCount}
            loading={notificationsLoading}
            onRefresh={onRefreshInbox}
            onMarkRead={onNotificationMarkRead}
            onMarkAllRead={onNotificationsMarkAllRead}
          />
        </Suspense>
      )}

      {activeTab === 'contact' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminContactMessages
            t={t}
            lang={lang}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'logs' && (
        <Suspense fallback={<AdminTabLoader />}>
          <AdminSiteLogs
            t={t}
            lang={lang}
            onNotify={onNotify}
          />
        </Suspense>
      )}

        <footer className="mt-8 flex items-center gap-2 text-[11px] text-[var(--text-muted)] border-t border-[var(--border)]/40 pt-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
          <span>{t.allDataLive}</span>
        </footer>
      </div>

      {gameModal?.id && (
        <AdminGameEditModal
          game={gameModal}
          games={games}
          offers={offers}
          lang={lang}
          t={t}
          onClose={() => setGameModal(null)}
          onSave={handleSaveGame}
          onDelete={deleteGameProp ? async (gameId) => {
            await deleteGameProp(gameId);
            if (gameModal?.id === gameId) setGameModal(null);
            if (refreshProducts) await refreshProducts();
            if (refreshOffers) await refreshOffers();
          } : undefined}
        />
      )}

      <ConfirmDialog
        open={!!confirmAction}
        title={confirmAction?.title}
        message={confirmAction?.message}
        confirmLabel={t.confirm}
        cancelLabel={t.cancel}
        loading={confirmLoading}
        onConfirm={handleConfirmAction}
        onCancel={() => setConfirmAction(null)}
      />
    </div>
  );
}

