import {
  BarChart3,
  Gamepad2,
  Gift,
  Package,
  ShoppingCart,
  Zap,
} from 'lucide-react';
import AdminDashSection from './AdminDashSection';
import AdminDashStatCard from './AdminDashStatCard';
import AdminDashGoTo from './AdminDashGoTo';
import AdminProfitOverview from './AdminProfitOverview';
import AdminSupplierWalletsCard from '../ui/AdminSupplierWalletsCard';
import {
  getAdminDashboardPath,
  getAdminOrdersPath,
  getAdminPaymentsPath,
} from '../../lib/adminRoutes';
import { getSypPerUsd } from '../../lib/rechargeCurrency';

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
  games = [],
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

  const goToTab = (tabId, path) => {
    setAdminTab?.(tabId);
    if (path) navigate(path);
    else navigate(getAdminDashboardPath(tabId));
  };

  return (
    <div className="admin-overview space-y-6 sm:space-y-8">
      <AdminSupplierWalletsCard
        t={t}
        lang={lang}
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
        onOpenDashboard={() => goToTab('apis')}
        onOpenPayments={() => goToTab('apis')}
        onOpenExchangeRate={openExchangeRateSettings}
        goToLabel={t.adminOverviewGoWallets}
        onGoToPage={() => goToTab('payments')}
      />

      <AdminDashSection
        title={t.adminOverviewCatalogTitle}
        description={t.adminOverviewCatalogDesc}
        icon={Package}
        action={(
          <AdminDashGoTo
            label={t.adminOverviewGoCatalog}
            onClick={() => goToTab('products')}
            lang={lang}
          />
        )}
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
        icon={BarChart3}
        action={(
          <AdminDashGoTo
            label={t.adminOverviewGoSales}
            onClick={() => goToTab('orders', getAdminOrdersPath())}
            lang={lang}
          />
        )}
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

      <AdminProfitOverview
        orders={orders}
        offers={offers}
        games={games}
        t={t}
        lang={lang}
        onOpenFullStats={() => goToTab('profits')}
      />
    </div>
  );
}
