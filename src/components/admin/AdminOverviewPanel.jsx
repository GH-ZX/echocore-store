import {
  BarChart3,
  Gamepad2,
  Gift,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import AdminDashSection from './AdminDashSection';
import AdminDashStatCard from './AdminDashStatCard';
import AdminProfitOverview from './AdminProfitOverview';
import AdminSupplierWalletsCard from '../ui/AdminSupplierWalletsCard';
import { getAdminOrdersPath, getAdminPaymentsPath } from '../../lib/adminRoutes';
import { getSypPerUsd } from '../../lib/rechargeCurrency';
import { formatOrderDisplayId, getOrderStatusLabel } from '../../lib/orderReceipt';
import { getOrderCustomerLabel } from '../../lib/adminOrderFilters';
import { formatMessage } from '../../lib/i18n';

function resolvePaymentMethodLabel(method, t = {}) {
  if (method === 'balance') return t.payFromBalance;
  if (method === 'admin_gift') return t.orderPaymentGift;
  if (method === 'ShamCash') return t.shamCash;
  if (method === 'SyriatelCash') return t.syriatelCash;
  return method || '—';
}

export default function AdminOverviewPanel({
  t = {},
  lang = 'ar',
  navigate,
  setAdminTab,
  catalogStats,
  totalOrders,
  totalRevenue,
  orders = [],
  offers = [],
  recentOrders = [],
  loadingOrders = false,
  g2bulkWallet,
  g2bulkError,
  g2bulkFetched,
  samWallets,
  samError,
  samNotConfigured,
  samFetched,
  supplierWalletsLoading,
  refreshSupplierWallets,
  paymentConfig = {},
}) {
  const sypPerUsd = getSypPerUsd(paymentConfig);

  const openExchangeRateSettings = () => {
    const target = getAdminPaymentsPath({ focusSypRate: true });
    navigate(target.pathname, { state: target.state });
  };

  return (
    <div className="admin-overview space-y-6 sm:space-y-8">
      <AdminSupplierWalletsCard
        t={t}
        variant="card"
        g2bulkBalance={g2bulkWallet != null ? g2bulkWallet.balance : null}
        g2bulkUsername={g2bulkWallet?.username}
        g2bulkError={g2bulkError}
        g2bulkFetched={g2bulkFetched}
        samWallets={samWallets}
        samError={samError}
        samNotConfigured={samNotConfigured}
        samFetched={samFetched}
        loading={supplierWalletsLoading}
        sypPerUsd={sypPerUsd}
        onRefresh={refreshSupplierWallets}
        onOpenDashboard={() => setAdminTab('products')}
        onOpenPayments={() => setAdminTab('payments')}
        onOpenExchangeRate={openExchangeRateSettings}
      />

      <AdminDashSection
        title={t.adminOverviewCatalogTitle}
        description={t.adminOverviewCatalogDesc}
      >
        <div className="admin-dash-grid admin-dash-grid--catalog">
          <AdminDashStatCard
            tone="games"
            label={t.catalogGames}
            value={catalogStats.games}
            help={t.catalogGamesHelp}
            icon={Gamepad2}
          />
          <AdminDashStatCard
            tone="topup"
            label={t.topupPacks}
            value={catalogStats.topupPacks}
            help={t.topupPacksHelp}
            icon={Zap}
          />
          <AdminDashStatCard
            tone="gift"
            label={t.giftCodes}
            value={catalogStats.giftCodes}
            help={t.giftCodesHelp}
            icon={Gift}
          />
        </div>
      </AdminDashSection>

      <AdminDashSection
        title={t.adminOverviewSalesTitle}
        description={t.adminOverviewSalesDesc}
      >
        <div className="admin-dash-grid admin-dash-grid--sales">
          <AdminDashStatCard
            tone="orders"
            label={t.totalOrders}
            value={totalOrders}
            help={t.totalOrdersHelp}
            icon={ShoppingCart}
          />
          <AdminDashStatCard
            tone="revenue"
            label={t.totalRevenue}
            value={`$${totalRevenue}`}
            help={t.totalRevenueHelp}
            icon={BarChart3}
            className="admin-dash-stat--wide"
          />
        </div>
      </AdminDashSection>

      <AdminProfitOverview orders={orders} offers={offers} t={t} />

      <AdminDashSection
        title={t.recentOrders}
        description={t.last5Orders}
        action={(
          <button
            type="button"
            onClick={() => setAdminTab('orders')}
            className="admin-dash-link"
          >
            {t.viewAll}
          </button>
        )}
      >
        {loadingOrders ? (
          <p className="admin-dash-empty">{t.loadingOrders}</p>
        ) : recentOrders.length === 0 ? (
          <p className="admin-dash-empty">{t.noOrdersYet}</p>
        ) : (
          <div className="admin-dash-orders">
            {recentOrders.map((order) => {
              const customer = getOrderCustomerLabel(order, t);
              const paymentLabel = resolvePaymentMethodLabel(order.payment_method, t);
              const itemCount = order.order_items?.length || 0;
              const statusLabel = getOrderStatusLabel(order.status, t);

              return (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => navigate(getAdminOrdersPath({ orderId: order.id }))}
                  className="admin-dash-order"
                >
                  <div className="admin-dash-order__main">
                    <span className="admin-dash-order__ref" dir="ltr">
                      #{formatOrderDisplayId(order)}
                    </span>
                    <span className="admin-dash-order__customer">{customer}</span>
                  </div>
                  <div className="admin-dash-order__meta">
                    <span>{new Date(order.created_at).toLocaleDateString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US')}</span>
                    <span className="admin-dash-order__dot" aria-hidden="true">·</span>
                    <span className="admin-dash-order__badge">{paymentLabel}</span>
                    <span className="admin-dash-order__dot" aria-hidden="true">·</span>
                    <span>{formatMessage(t.adminOverviewOrderItems, { count: itemCount })}</span>
                  </div>
                  <div className="admin-dash-order__side">
                    <span className="admin-dash-order__amount" dir="ltr">
                      ${parseFloat(order.total || 0).toFixed(2)}
                    </span>
                    <span className={`admin-dash-order__status admin-dash-order__status--${order.status || 'pending'}`}>
                      {statusLabel}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </AdminDashSection>
    </div>
  );
}