import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAdminDashboardPath, getAdminOrdersPath, isValidAdminTabSegment, resolveAdminTabFromPath } from '../../lib/adminRoutes';
import { getOrderCustomerLabel } from '../../lib/adminOrderFilters';
import { formatOrderDisplayId } from '../../lib/orderReceipt';
import { Trash2, Plus, BarChart3, Package, ShoppingCart, Edit, Wallet, Palette, LayoutGrid, MessageSquare, CircleDollarSign, Percent, Zap, PanelLeftClose, PanelLeftOpen, Users, ScrollText } from 'lucide-react';
import { supabase } from '../../lib/supabase';

import { centerActiveMobileTab, resetPageHorizontalScroll } from '../../lib/adminMobileNav';
import { getCatalogOfferStats } from '../../lib/catalogUtils';
import AdminProfitOverview from '../../components/admin/AdminProfitOverview';
import AdminSupplierWalletsCard from '../../components/ui/AdminSupplierWalletsCard';
import { useAdminSupplierWallets } from '../../hooks/useAdminSupplierWallets';
import AdminExistingGamesList from '../../components/admin/AdminExistingGamesList';
import AdminSaleDiscountsManager from '../../components/admin/AdminSaleDiscountsManager';
import AdminGameEditModal from '../../components/admin/AdminGameEditModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
const AdminPaymentsSettings = lazy(() => import('../../components/admin/AdminPaymentsSettings'));
const AdminThemeSettings = lazy(() => import('../../components/admin/AdminThemeSettings'));
const AdminHomeLayoutSettings = lazy(() => import('../../components/admin/AdminHomeLayoutSettings'));
const AdminReviewsManager = lazy(() => import('../../components/admin/AdminReviewsManager'));
const AdminRechargeManager = lazy(() => import('../../components/admin/AdminRechargeManager'));
const AdminG2BulkSettings = lazy(() => import('../../components/admin/AdminG2BulkSettings'));
const AdminUsersManager = lazy(() => import('../../components/admin/AdminUsersManager'));
const AdminOrdersManager = lazy(() => import('../../components/admin/AdminOrdersManager'));
const AdminSiteLogs = lazy(() => import('../../components/admin/AdminSiteLogs'));

function AdminTabLoader({ label = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-16 text-[var(--text-sec)] animate-pulse text-sm">
      {label}
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
  return [
    { id: 'overview', label: t.overview, shortLabel: t.tabOverviewShort, icon: BarChart3 },
    { id: 'home', label: t.homeLayoutTab, shortLabel: t.tabHomeShort, icon: LayoutGrid },
    { id: 'products', label: t.gamesAndOffers, shortLabel: t.tabGamesShort, icon: Package },
    { id: 'orders', label: t.ordersTab, shortLabel: t.tabOrdersShort, icon: ShoppingCart },
    { id: 'payments', label: t.paymentsTab, shortLabel: t.tabPaymentsShort, icon: Wallet },
    { id: 'recharges', label: t.rechargesTab, shortLabel: t.tabRechargesShort, icon: CircleDollarSign },
    { id: 'theme', label: t.themeTab, shortLabel: t.tabThemeShort, icon: Palette },
    { id: 'reviews', label: t.reviewsTab, shortLabel: t.tabReviewsShort, icon: MessageSquare },
    { id: 'users', label: t.usersTab, shortLabel: t.tabUsersShort, icon: Users },
    { id: 'logs', label: t.logsTab, shortLabel: t.tabLogsShort, icon: ScrollText },
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
  saveGame,
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
  onApproveOrder,
  onRejectOrder,
  onFulfillOrder,
  onDevBalanceCredited: _onDevBalanceCredited,
  onPreviewHomepage,
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = useMemo(() => resolveAdminTabFromPath(location.pathname), [location.pathname]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const adminNavItems = useMemo(() => buildAdminNavItems(t), [t]);
  const activeNavItem = useMemo(
    () => adminNavItems.find((item) => item.id === activeTab) || adminNavItems[0],
    [adminNavItems, activeTab],
  );
  const mobileNavRef = useRef(null);

  const setAdminTab = (tabId) => {
    resetPageHorizontalScroll();
    navigate(getAdminDashboardPath(tabId));
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
    if (parts[1] === 'g2bulk') {
      navigate('/dashboard/products', { replace: true });
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
    const payload = { ...gameData, active: true };
    if (gameData.id) {
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
    } else if (saveGame) {
      await saveGame(payload);
      notifySuccess(t.gameAddedSelectOffer);
    } else {
      const { error } = await supabase
        .from('games')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      notifySuccess(t.gameAddedSelectOffer);
    }
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
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0).toFixed(2);
  const recentOrders = [...orders].slice(0, 5);

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
          {adminNavItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAdminTab(tab.id)}
                className={`admin-nav-btn${isActive ? ' admin-nav-btn--active' : ''}`}
                title={sidebarCollapsed ? tab.label : undefined}
                aria-current={isActive ? 'page' : undefined}
              >
                <Icon className="admin-nav-btn__icon" aria-hidden="true" />
                <span className="admin-nav-btn__label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <div className="admin-main">
        <nav
          ref={mobileNavRef}
          className="admin-mobile-nav glass-panel flex md:hidden"
          aria-label={t.adminNavLabel}
        >
          {adminNavItems.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setAdminTab(tab.id)}
                className={`admin-mobile-tab${isActive ? ' admin-mobile-tab--active' : ''}`}
                aria-current={isActive ? 'page' : undefined}
                title={tab.label}
              >
                <Icon className="admin-mobile-tab__icon" aria-hidden="true" />
                <span className="admin-mobile-tab__label">{tab.shortLabel}</span>
              </button>
            );
          })}
        </nav>

        <header className="admin-page-header mb-4 sm:mb-6">
          <p className="text-[10px] sm:hidden font-semibold uppercase tracking-wider text-[var(--accent)] mb-0.5">
            {t.adminDashboard}
          </p>
          <h1 className="text-xl sm:text-3xl font-black truncate">
            {activeNavItem?.label || t.adminDashboard}
          </h1>
          <p className="text-xs sm:text-base text-[var(--text-sec)] mt-0.5 sm:mt-0">
            {activeTab === 'overview' ? t.manageYourStore : t.adminSectionHelp}
          </p>
        </header>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          <AdminSupplierWalletsCard
            t={t}
            variant="card"
            g2bulkBalance={g2bulkWallet?.balance ?? 0}
            g2bulkUsername={g2bulkWallet?.username}
            g2bulkError={g2bulkError}
            g2bulkFetched={g2bulkFetched}
            samWallets={samWallets}
            samError={samError}
            samNotConfigured={samNotConfigured}
            samFetched={samFetched}
            loading={supplierWalletsLoading}
            onRefresh={refreshSupplierWallets}
            onOpenDashboard={() => setAdminTab('products')}
            onOpenPayments={() => setAdminTab('payments')}
          />

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="dash-stat-card card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.catalogGames}</div>
                  <div className="text-3xl sm:text-4xl font-black mt-1">{catalogStats.games}</div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">
                    {t.catalogGamesHelp}
                  </p>
                </div>
                <div className="dash-stat-icon">
                  <Package className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--accent)]" />
                </div>
              </div>
            </div>

            <div className="dash-stat-card card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.topupPacks}</div>
                  <div className="text-3xl sm:text-4xl font-black mt-1">{catalogStats.topupPacks}</div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">
                    {t.topupPacksHelp}
                  </p>
                </div>
                <div className="dash-stat-icon">
                  <Zap className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--accent)]" />
                </div>
              </div>
            </div>

            <div className="dash-stat-card card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.giftCodes}</div>
                  <div className="text-3xl sm:text-4xl font-black mt-1">{catalogStats.giftCodes}</div>
                  <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">
                    {t.giftCodesHelp}
                  </p>
                </div>
                <div className="dash-stat-icon">
                  <Plus className="w-8 h-8 sm:w-10 sm:h-10 text-violet-300" />
                </div>
              </div>
            </div>

            <div className="dash-stat-card card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.totalOrders}</div>
                  <div className="text-3xl sm:text-4xl font-black mt-1">{totalOrders}</div>
                </div>
                <div className="dash-stat-icon">
                  <ShoppingCart className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--accent)]" />
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="dash-stat-card dash-stat-card--success card p-4 sm:p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[var(--text-sec)] text-sm">{t.totalRevenue}</div>
                  <div className="text-3xl sm:text-4xl font-black mt-1 text-[var(--success)]">${totalRevenue}</div>
                </div>
                <div className="dash-stat-icon dash-stat-icon--success">
                  <BarChart3 className="w-8 h-8 sm:w-10 sm:h-10 text-[var(--success)]" />
                </div>
              </div>
            </div>

            <div className="card p-4 sm:p-6 text-sm text-[var(--text-sec)] leading-relaxed">
              <p className="font-semibold text-[var(--text-primary)] mb-2">
                {t.catalogStatsLegend}
              </p>
              <p>{t.catalogStatsLegendBody}</p>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {t.catalogTotalPacks}: {catalogStats.totalPacks}
              </p>
            </div>
          </div>

          <AdminProfitOverview orders={orders} offers={offers} t={t} />

          {/* Recent Orders */}
          <div className="card p-4 sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div className="min-w-0">
                <h3 className="font-bold text-lg sm:text-xl">{t.recentOrders}</h3>
                <p className="text-xs text-[var(--text-muted)]">{t.last5Orders}</p>
              </div>
              <button onClick={() => setAdminTab('orders')} className="text-sm text-[var(--accent)] hover:underline self-start sm:self-auto flex-shrink-0">View All →</button>
            </div>

            {loadingOrders ? (
              <div className="text-[var(--text-sec)]">{t.loadingOrders}</div>
            ) : recentOrders.length === 0 ? (
              <div className="text-[var(--text-sec)] py-8 text-center">{t.noOrdersYet}</div>
            ) : (
              <div className="space-y-3">
                {recentOrders.map(order => {
                  const customer = getOrderCustomerLabel(order, t);
                  return (
                    <div 
                      key={order.id} 
                      onClick={() => navigate(getAdminOrdersPath({ orderId: order.id }))}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/30 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-[var(--text-muted)]">#{formatOrderDisplayId(order)}</div>
                        <div className="text-sm truncate">{customer}</div>
                        <div className="text-xs text-[var(--text-muted)]">{new Date(order.created_at).toLocaleDateString()}</div>
                      </div>
                      <div className="sm:text-right flex-shrink-0">
                        <div className="font-bold text-lg">${parseFloat(order.total || 0).toFixed(2)}</div>
                        <div className="text-xs text-[var(--text-sec)]">{order.payment_method || 'N/A'} • {(order.order_items?.length || 0)} items</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRODUCTS TAB */}
      {activeTab === 'products' && (
        <div className="space-y-6">
          <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
            <AdminG2BulkSettings
              embedded
              t={t}
              lang={lang}
              onCatalogSynced={onCatalogSynced}
            />
          </Suspense>

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
                <p className="text-xs text-[var(--text-muted)] mt-1">{t.englishNameOnlyHelp}</p>
              </div>
              <button
                type="button"
                onClick={() => setGameModal({})}
                className="btn btn-primary inline-flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                {t.addNewGame}
              </button>
            </div>
            <AdminExistingGamesList
              games={games}
              offers={offers}
              lang={lang}
              t={t}
              editingGameId={gameModal?.id}
              onEdit={(game) => setGameModal(game)}
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
                              <span className="line-through">${parseFloat(offer.original_price).toFixed(2)}</span>
                              <span className="font-semibold text-red-400">${parseFloat(offer.price).toFixed(2)}</span>
                            </>
                          ) : (
                            <span>${parseFloat(offer.price).toFixed(2)}</span>
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
                <div className="p-8 text-center text-[var(--text-sec)]">{t.noOffersYetAddGame}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'orders' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminOrdersManager
            t={t}
            lang={lang}
            orders={orders}
            loadingOrders={loadingOrders}
            refreshOrders={refreshOrders}
            onApproveOrder={onApproveOrder}
            onRejectOrder={onRejectOrder}
            onFulfillOrder={onFulfillOrder}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'payments' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminPaymentsSettings
            t={t}
            lang={lang}
            onSaved={onPaymentSettingsSaved}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'recharges' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminRechargeManager
            t={t}
            lang={lang}
            onNotify={onNotify}
            onApproved={onRechargeApproved}
          />
        </Suspense>
      )}

      {activeTab === 'theme' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminThemeSettings
            t={t}
            lang={lang}
            onSaved={onThemeSaved}
          />
        </Suspense>
      )}

      {activeTab === 'home' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
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
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminReviewsManager
            t={t}
            onChanged={onReviewsChanged}
          />
        </Suspense>
      )}

      {activeTab === 'users' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminUsersManager
            t={t}
            lang={lang}
            onNotify={onNotify}
          />
        </Suspense>
      )}

      {activeTab === 'logs' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminSiteLogs
            t={t}
            lang={lang}
            onNotify={onNotify}
          />
        </Suspense>
      )}

        <div className="text-xs text-center text-[var(--text-muted)] mt-8">
          {t.allDataLive}
        </div>
      </div>

      {gameModal && (
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

