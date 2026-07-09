import React, { useState, useEffect, useMemo, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getAdminDashboardPath, isValidAdminTabSegment, resolveAdminTabFromPath } from '../../lib/adminRoutes';
import { Trash2, Plus, BarChart3, Package, ShoppingCart, RefreshCw, Edit, Wallet, Palette, LayoutGrid, MessageSquare, CircleDollarSign, Zap, FlaskConical, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { uploadImage } from '../../lib/uploadImage';
import { getCatalogOfferStats } from '../../lib/catalogUtils';
import AdminExistingGamesList from '../../components/admin/AdminExistingGamesList';
import AdminGameEditModal from '../../components/admin/AdminGameEditModal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
const AdminPaymentsSettings = lazy(() => import('../../components/admin/AdminPaymentsSettings'));
const AdminThemeSettings = lazy(() => import('../../components/admin/AdminThemeSettings'));
const AdminHomeLayoutSettings = lazy(() => import('../../components/admin/AdminHomeLayoutSettings'));
const AdminReviewsManager = lazy(() => import('../../components/admin/AdminReviewsManager'));
const AdminRechargeManager = lazy(() => import('../../components/admin/AdminRechargeManager'));
const AdminG2BulkSettings = lazy(() => import('../../components/admin/AdminG2BulkSettings'));
const AdminDevTools = lazy(() => import('../../components/admin/AdminDevTools'));

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
    { id: 'g2bulk', label: t.g2bulkTab, shortLabel: 'G2B', icon: Zap },
    { id: 'recharges', label: t.rechargesTab, shortLabel: t.tabRechargesShort, icon: CircleDollarSign },
    { id: 'theme', label: t.themeTab, shortLabel: t.tabThemeShort, icon: Palette },
    { id: 'reviews', label: t.reviewsTab, shortLabel: t.tabReviewsShort, icon: MessageSquare },
    { id: 'devtools', label: t.devToolsTab, shortLabel: 'DEV', icon: FlaskConical },
  ];
}

export default function AdminView({ 
  t, 
  lang, 
  games = [],
  offers = [],
  orders = [], 
  loadingOrders = false,
  createProduct, 
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
  onDevBalanceCredited,
  onPreviewHomepage,
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');
  const location = useLocation();
  const navigate = useNavigate();
  const activeTab = useMemo(() => resolveAdminTabFromPath(location.pathname), [location.pathname]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(readSidebarCollapsed);
  const adminNavItems = useMemo(() => buildAdminNavItems(t), [t]);

  const setAdminTab = (tabId) => {
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
    if (!isValidAdminTabSegment(parts[1])) {
      navigate('/dashboard', { replace: true });
    }
  }, [location.pathname, navigate]);
  const [newProduct, setNewProduct] = useState({
    game_id: '',
    name_en: '',
    name_ar: '',
    price: '',
    image_url: '',
    description_en: '',
    description_ar: '',
    sale_image_url: '',
    is_sale: false,
    original_price: ''
  });
  const [uploading, setUploading] = useState(false);
  const [saleCoverFile, setSaleCoverFile] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  // Editing state
  const [editingId, setEditingId] = useState(null);

  const [productFormError, setProductFormError] = useState('');
  const [productFormSuccess, setProductFormSuccess] = useState('');

  const [gameModal, setGameModal] = useState(null);

  // Filter offers list by game
  const [filterGameId, setFilterGameId] = useState('');

  // Orders expandable
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [processingOrderId, setProcessingOrderId] = useState(null);

  const isAwaitingShamcash = (order) => (
    order.payment_method === 'ShamCash'
    && (order.status === 'pending_payment' || order.status === 'payment_sent')
  );

  const handleApproveOrder = async (orderId) => {
    if (!onApproveOrder) return;
    setProcessingOrderId(orderId);
    try {
      await onApproveOrder(orderId);
      notifySuccess(t.orderApproved);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const handleRejectOrder = async (orderId) => {
    if (!onRejectOrder) return;
    setProcessingOrderId(orderId);
    try {
      await onRejectOrder(orderId);
      notifySuccess(t.orderRejected);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingOrderId(null);
    }
  };

  const orderStatusLabel = (status) => {
    const map = {
      pending_payment: t.orderStatusPendingPayment,
      payment_sent: t.orderStatusPaymentSent,
      completed: t.orderStatusCompleted,
      cancelled: t.orderStatusCancelled,
    };
    return map[status] || status;
  };

  const orderStatusColor = (status) => {
    if (status === 'completed') return 'text-emerald-400';
    if (status === 'payment_sent') return 'text-amber-300';
    if (status === 'pending_payment') return 'text-amber-400';
    if (status === 'cancelled') return 'text-red-400';
    return 'text-[var(--text-sec)]';
  };

  const renderOrderExtras = (order) => (
    <>
      {order.payment_reference && (
        <div className="text-xs mt-2">
          <span className="text-[var(--text-muted)]">{t.paymentReference}:</span>{' '}
          <span className="font-mono">{order.payment_reference}</span>
        </div>
      )}
      {isAwaitingShamcash(order) && onApproveOrder && onRejectOrder && (
        <div className="flex flex-wrap gap-2 mt-3">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleApproveOrder(order.id); }}
            disabled={processingOrderId === order.id}
            className="btn btn-primary text-xs py-2 px-3"
          >
            {processingOrderId === order.id ? '...' : t.approveShort}
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleRejectOrder(order.id); }}
            disabled={processingOrderId === order.id}
            className="btn btn-secondary text-xs py-2 px-3"
          >
            {t.rejectShort}
          </button>
        </div>
      )}
    </>
  );

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
      const created = await saveGame(payload);
      if (created?.id) {
        setNewProduct((prev) => ({ ...prev, game_id: created.id }));
      }
      notifySuccess(t.gameAddedSelectOffer);
    } else {
      const { data, error } = await supabase
        .from('games')
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      if (data?.id) {
        setNewProduct((prev) => ({ ...prev, game_id: data.id }));
      }
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



  const handleSubmit = async (e) => {
    e.preventDefault();
    setProductFormError('');
    if (!newProduct.name_en || !newProduct.price || !newProduct.game_id) {
      setProductFormError(t.gameNameEnglishAndPriceRequired);
      return;
    }
    if (newProduct.is_sale && !newProduct.original_price) {
      setProductFormError(t.originalPriceRequiredForSale);
      return;
    }

    const desc = (newProduct.description_en || '').trim();

    try {
      // Handle sale photo upload
      let finalSaleImage = newProduct.sale_image_url;
      if (saleCoverFile) {
        setUploading(true);
        try {
          const uploaded = await uploadImage(saleCoverFile, 'sale');
          if (uploaded) finalSaleImage = uploaded;
        } catch (uploadErr) {
          throw new Error(t.imageUploadFailed, { cause: uploadErr });
        } finally {
          setUploading(false);
        }
      }

      // Offers do not use main image or amount. One description used for both languages.
      // Optional sale_image_url for dedicated sale offer cards.
      const productData = {
        game_id: newProduct.game_id,
        name_en: newProduct.name_en.trim(),
        name_ar: (newProduct.name_ar || newProduct.name_en).trim(),
        price: newProduct.price,
        amount: null,
        image_url: null,
        description_en: desc,
        description_ar: desc,
        sale_image_url: finalSaleImage || null,
        is_sale: !!newProduct.is_sale,
        original_price: newProduct.is_sale ? (parseFloat(newProduct.original_price) || null) : null
      };

      if (editingId) {
        await updateProduct({ ...productData, id: editingId });
      } else {
        await createProduct(productData);
      }

      // reset form + files + editing
      resetForm();
      if (refreshProducts) await refreshProducts();

      setProductFormSuccess(editingId ? t.offerUpdatedSuccess : t.offerAddedSuccess);
      setTimeout(() => setProductFormSuccess(''), 2500);
    } catch (err) {
      console.error('Product save error:', err);
      setProductFormError(err.message || t.failedToSaveOffer);
    }
  };

  const resetForm = () => {
    setNewProduct({
      game_id: '',
      name_en: '', name_ar: '', price: '',
      image_url: '', description_en: '', description_ar: '',
      sale_image_url: '',
      is_sale: false,
      original_price: ''
    });
    setSaleCoverFile(null);
    setEditingId(null);
    setProductFormError('');
    setProductFormSuccess('');
  };

  const startEdit = (product) => {
    setEditingId(product.id);
    setNewProduct({
      game_id: product.game_id || '',
      name_en: product.name_en || '',
      name_ar: product.name_ar || '',
      price: product.price || '',
      image_url: product.image_url || '',
      description_en: product.description_en || product.description_ar || '',
      description_ar: product.description_ar || product.description_en || '',
      sale_image_url: product.sale_image_url || '',
      is_sale: !!product.is_sale,
      original_price: product.original_price || ''
    });
    setSaleCoverFile(null);
    // Scroll to form or switch tab if needed
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const catalogStats = useMemo(
    () => getCatalogOfferStats(offers, games),
    [offers, games],
  );
  const totalOrders = orders.length;
  const totalRevenue = orders.reduce((sum, o) => sum + parseFloat(o.total || 0), 0).toFixed(2);
  const recentOrders = [...orders].slice(0, 5);

  return (
    <div className={`admin-shell admin-layout mt-4 sm:mt-6 animate-fade-in${sidebarCollapsed ? ' admin-layout--collapsed' : ''}`} dir="ltr">
      <aside
        className={`admin-sidebar${sidebarCollapsed ? ' admin-sidebar--collapsed' : ''}`}
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5 sm:mb-6">
          <div className="min-w-0">
            <h1 className="text-2xl sm:text-3xl font-black">{t.adminDashboard}</h1>
            <p className="text-sm sm:text-base text-[var(--text-sec)]">{t.manageYourStore}</p>
          </div>
          <div className="flex gap-2 self-start sm:self-auto flex-shrink-0">
            {refreshProducts && (
              <button onClick={refreshProducts} className="btn btn-secondary flex items-center gap-2 text-sm px-3 sm:px-4" title={t.refresh}>
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">{t.refresh}</span>
              </button>
            )}
          </div>
        </div>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
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
                  const customer = order.profiles?.name || (order.user_id ? `User ${order.user_id.slice(0, 6)}` : 'Unknown');
                  return (
                    <div 
                      key={order.id} 
                      onClick={() => {
                        setAdminTab('orders');
                        setExpandedOrderId(order.id);
                      }}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 bg-[var(--bg-primary)] rounded-xl border border-[var(--border)] hover:border-[var(--accent)]/30 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs text-[var(--text-muted)]">#{order.id.slice(0,8)}</div>
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
        <div className="space-y-8">
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

          {/* OFFERS / PRODUCTS SECTION */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Add / Upload Offer Form */}
            <div className="lg:col-span-1 card p-4 sm:p-6 h-fit">
              <div className="flex items-center gap-2 mb-5">
                <Plus className="w-5 h-5 text-[var(--accent)]" />
                <h3 className="text-lg sm:text-xl font-bold">{editingId ? t.editOffer : t.addNewOffer}</h3>
              </div>
              <p className="text-xs text-[var(--text-muted)] -mt-2 mb-3">{t.addGamesAbove}</p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input required placeholder={t.nameEnglish} value={newProduct.name_en} onChange={e => setNewProduct({ ...newProduct, name_en: e.target.value })} className="input" />
                <input placeholder={t.nameArabicOptional} value={newProduct.name_ar} onChange={e => setNewProduct({ ...newProduct, name_ar: e.target.value })} className="input" />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-1 block">{t.selectGame}</label>
                <select 
                  required
                  value={newProduct.game_id || ''} 
                  onChange={e => setNewProduct({ ...newProduct, game_id: e.target.value })} 
                  className="input w-full"
                >
                  <option value="">{t.selectGame}</option>
                  {games.map(g => (
                    <option key={g.id} value={g.id}>
                      {lang === 'ar' ? g.name_ar : g.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <input required type="number" step="0.01" placeholder={t.price} value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} className="input" />

              <div className="flex items-center gap-2">
                <input 
                  type="checkbox" 
                  checked={!!newProduct.is_sale} 
                  onChange={e => setNewProduct({ ...newProduct, is_sale: e.target.checked, original_price: e.target.checked ? newProduct.original_price : '' })} 
                  className="accent-[var(--accent)]" 
                />
                <label className="text-xs font-semibold text-[var(--text-sec)]">{t.thisIsSaleOffer}</label>
              </div>

              {newProduct.is_sale && (
                <div>
                  <input 
                    required 
                    type="number" 
                    step="0.01" 
                    placeholder={t.originalPriceBeforeDiscount} 
                    value={newProduct.original_price || ''} 
                    onChange={e => setNewProduct({ ...newProduct, original_price: e.target.value })} 
                    className="input" 
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-1.5 block">{t.descriptionOneEnough}</label>
                <textarea 
                  placeholder={t.descriptionOneEnough} 
                  value={newProduct.description_en} 
                  onChange={e => setNewProduct({ ...newProduct, description_en: e.target.value })} 
                  className="input w-full h-20 text-sm resize-y" 
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-[var(--text-sec)] mb-0.5 block">{t.salePhotoOptional}</label>
                <p className="text-[10px] text-[var(--text-muted)] -mt-1 mb-1.5">{t.salePhotoHelp}</p>
                <div className="flex flex-col gap-2">
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => setSaleCoverFile(e.target.files?.[0] || null)} 
                    className="input flex-1 text-sm file:mr-2 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:bg-[var(--accent)] file:text-[#040812]" 
                  />
                  <input 
                    placeholder={t.orPasteSalePhotoURL} 
                    value={newProduct.sale_image_url || ''} 
                    onChange={e => setNewProduct({ ...newProduct, sale_image_url: e.target.value })} 
                    className="input flex-1 text-sm" 
                  />
                </div>
                {saleCoverFile && <div className="text-xs text-emerald-400 mt-1">{t.willUploadSalePhoto}: {saleCoverFile.name}</div>}
                {newProduct.sale_image_url && !saleCoverFile && (
                  <img src={newProduct.sale_image_url} alt={t.preview} className="mt-2 h-16 w-auto object-cover rounded border" />
                )}
              </div>

              {productFormError && (
                <div className="bg-red-500/10 border border-red-500/60 text-red-400 p-2 rounded text-xs">
                  {productFormError}
                </div>
              )}
              {productFormSuccess && (
                <div className="bg-emerald-500/10 border border-emerald-500/60 text-emerald-400 p-2 rounded text-xs">
                  {productFormSuccess}
                </div>
              )}

              <div className="flex gap-2">
                <button 
                  type="submit" 
                  disabled={uploading} 
                  className="btn btn-primary flex-1 py-3.5 disabled:opacity-60"
                >
                  {uploading ? t.uploading : (editingId ? t.updateOffer : t.addOffer)}
                </button>
                {editingId && (
                  <button 
                    type="button" 
                    onClick={resetForm} 
                    className="btn btn-secondary px-6"
                  >
                    {t.cancel}
                  </button>
                )}
              </div>
            </form>

            <p className="text-xs text-[var(--text-muted)] mt-4">
              {t.offersNeedOnly}
            </p>
          </div>

          {/* Offers List */}
          <div className="lg:col-span-2 card p-4 sm:p-6">
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
                        <button 
                          onClick={() => startEdit(offer)} 
                          className="p-2 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-xl"
                          title="Edit"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
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
      </div>
      )}

      {/* ORDERS TAB */}
      {activeTab === 'orders' && (
        <div className="card p-4 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-5">
            <div className="min-w-0">
              <h3 className="font-bold text-lg sm:text-xl">{t.ordersTab} ({orders.length})</h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">{t.clickAnyRow}</p>
            </div>
            {refreshOrders && (
              <button onClick={refreshOrders} className="text-sm btn btn-secondary self-start sm:self-auto flex-shrink-0">
                <RefreshCw className="w-4 h-4 sm:mr-1" />
                <span className="hidden sm:inline">{t.refresh}</span>
              </button>
            )}
          </div>

          {loadingOrders ? (
            <div className="py-12 text-center text-[var(--text-sec)]">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="py-12 text-center">
              <p>{t.noOrdersYet}</p>
              <p className="text-xs text-[var(--text-muted)] mt-2">Make sure you are logged in as admin, your profile has role='admin', and RLS policies for orders are applied.</p>
            </div>
          ) : (
            <>
            <div className="md:hidden space-y-3">
              {orders.map(order => {
                const isExpanded = expandedOrderId === order.id;
                const items = order.order_items || [];
                const customer = order.profiles?.name || (order.user_id ? `User ${order.user_id.slice(0, 8)}` : 'Unknown');
                return (
                  <div
                    key={order.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedOrderId(isExpanded ? null : order.id)}
                      className="w-full text-left p-4 space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-mono text-xs text-[var(--text-muted)]">#{order.id.slice(0, 8)}...</div>
                          <div className="font-medium text-sm mt-0.5 truncate">{customer}</div>
                          <div className="text-xs text-[var(--text-muted)] mt-1">{new Date(order.created_at).toLocaleString()}</div>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="font-bold text-[var(--accent)]">${parseFloat(order.total || 0).toFixed(2)}</div>
                          <div className="text-[10px] text-[var(--text-sec)] mt-1 capitalize">{order.payment_method || '—'}</div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs text-[var(--text-sec)]">
                        <span>{items.length} {t.items}</span>
                        <span>{isExpanded ? '−' : '+'}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div className="px-4 pb-4 pt-0 border-t border-[var(--border)] text-sm">
                        <div className="flex flex-col gap-1 mb-3 text-xs">
                          <div><span className="text-[var(--text-muted)]">{t.customerLabel}</span> <span className="font-medium">{customer}</span></div>
                          <div>
                            <span className="text-[var(--text-muted)]">{t.statusLabel}</span>{' '}
                            <span className={orderStatusColor(order.status)}>{orderStatusLabel(order.status || 'completed')}</span>
                          </div>
                          <div><span className="text-[var(--text-muted)]">{t.payment}</span> <span className="capitalize">{order.payment_method || '—'}</span></div>
                          {renderOrderExtras(order)}
                        </div>
                        <div className="text-[var(--text-sec)] mb-2 text-xs font-semibold uppercase tracking-wider">{t.itemsLabel}</div>
                        <div className="space-y-1">
                          {items.length > 0 ? items.map((item, idx) => (
                            <div key={idx} className="flex justify-between gap-3 text-xs py-0.5">
                              <span className="min-w-0 break-words">{item.name_snapshot}</span>
                              <span className="font-mono text-[var(--accent)] flex-shrink-0">${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}</span>
                            </div>
                          )) : (
                            <div className="text-[var(--text-muted)] text-xs">{t.noItemsRecorded}</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="text-left text-[var(--text-sec)] border-b border-[var(--border)]">
                    <th className="py-3 pr-4">{t.orderId}</th>
                    <th className="py-3 pr-4">{t.customer}</th>
                    <th className="py-3 pr-4">{t.date}</th>
                    <th className="py-3 pr-4">{t.total}</th>
                    <th className="py-3 pr-4">{t.payment}</th>
                    <th className="py-3 pr-4">{t.items}</th>
                    <th className="py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map(order => {
                    const isExpanded = expandedOrderId === order.id;
                    const items = order.order_items || [];
                    const customer = order.profiles?.name || (order.user_id ? `User ${order.user_id.slice(0, 8)}` : 'Unknown');
                    return (
                      <React.Fragment key={order.id}>
                        <tr 
                          onClick={() => setExpandedOrderId(isExpanded ? null : order.id)} 
                          className="border-b border-[var(--border)] last:border-0 hover:bg-white/5 cursor-pointer"
                        >
                          <td className="py-3 pr-4 font-mono text-xs">{order.id.slice(0, 8)}...</td>
                          <td className="py-3 pr-4">
                            <div className="font-medium text-sm">{customer}</div>
                            {order.user_id && (
                              <div className="font-mono text-[10px] text-[var(--text-muted)]">{order.user_id.slice(0, 8)}...</div>
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs">{new Date(order.created_at).toLocaleString()}</td>
                          <td className="py-3 pr-4 font-bold text-[var(--accent)]">${parseFloat(order.total || 0).toFixed(2)}</td>
                          <td className="py-3 pr-4 text-xs capitalize">{order.payment_method || '—'}</td>
                          <td className="py-3 pr-4 text-xs">
                            <span className="inline-block px-2 py-0.5 rounded bg-[var(--bg-elevated)] text-[var(--text-sec)]">{items.length}</span>
                          </td>
                          <td className="py-3 text-right text-[var(--text-sec)]">
                            {isExpanded ? '−' : '+'}
                          </td>
                        </tr>

                        {/* Expanded details */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={7} className="p-0">
                              <div className="bg-[var(--bg-primary)] px-4 py-4 text-sm border-b border-[var(--border)]">
                                <div className="flex flex-wrap gap-x-8 gap-y-1 mb-3 text-xs">
                                  <div><span className="text-[var(--text-muted)]">{t.customerLabel}</span> <span className="font-medium">{customer}</span></div>
                                  <div>
                                    <span className="text-[var(--text-muted)]">{t.statusLabel}</span>{' '}
                                    <span className={orderStatusColor(order.status)}>{orderStatusLabel(order.status || 'completed')}</span>
                                  </div>
                                  <div><span className="text-[var(--text-muted)]">{t.payment}</span> <span className="capitalize">{order.payment_method || '—'}</span></div>
                                </div>
                                {renderOrderExtras(order)}

                                <div className="text-[var(--text-sec)] mb-2 text-xs font-semibold uppercase tracking-wider">{t.itemsLabel}</div>
                                <div className="space-y-1 pl-1">
                                  {items.length > 0 ? items.map((item, idx) => (
                                    <div key={idx} className="flex justify-between text-xs py-0.5">
                                      <span>{item.name_snapshot}</span>
                                      <span className="font-mono text-[var(--accent)]">${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}</span>
                                    </div>
                                  )) : (
                                    <div className="text-[var(--text-muted)] text-xs">{t.noItemsRecorded}</div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      )}

      {activeTab === 'payments' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminPaymentsSettings
            t={t}
            lang={lang}
            onSaved={onPaymentSettingsSaved}
          />
        </Suspense>
      )}

      {activeTab === 'g2bulk' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminG2BulkSettings t={t} lang={lang} onCatalogSynced={onCatalogSynced} />
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

      {activeTab === 'devtools' && (
        <Suspense fallback={<AdminTabLoader label={t.loadingAdminTab} />}>
          <AdminDevTools
            t={t}
            lang={lang}
            offers={offers}
            orders={orders}
            onBalanceCredited={onDevBalanceCredited}
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

