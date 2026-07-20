import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  TrendingUp,
  Package,
  Percent,
  AlertTriangle,
  BarChart3,
  ShoppingCart,
  DollarSign,
  ArrowRightLeft,
  Trophy,
  CalendarRange,
  ListOrdered,
  Users,
  ChevronDown,
} from 'lucide-react';
import { formatDate, formatMessage } from '../../lib/i18n';
import {
  computeAdminProfitMetrics,
  PROFIT_PERIOD_OPTIONS,
} from '../../lib/adminProfitMetrics';
import { getAdminOrdersPath } from '../../lib/adminRoutes';
import AdminDashSection from './AdminDashSection';
import AdminDashStatCard from './AdminDashStatCard';
import { ProfitChartPanel } from './AdminProfitCharts';

const RANK_TABS = [
  { id: 'units', labelKey: 'adminProfitRankByUnits' },
  { id: 'revenue', labelKey: 'adminProfitRankByRevenue' },
  { id: 'profit', labelKey: 'adminProfitRankByProfit' },
];

const CUSTOMER_RANK_TABS = [
  { id: 'revenue', labelKey: 'adminProfitRankByRevenue' },
  { id: 'orders', labelKey: 'adminProfitRankByOrders' },
  { id: 'profit', labelKey: 'adminProfitRankByProfit' },
];

function periodLabel(periodDays, t) {
  if (periodDays == null) return t.adminProfitPeriodAll;
  if (periodDays === 1) return t.adminProfitPeriod1;
  if (periodDays === 7) return t.adminProfitPeriod7;
  if (periodDays === 14) return t.adminProfitPeriod14;
  if (periodDays === 30) return t.adminProfitPeriod30;
  if (periodDays === 90) return t.adminProfitPeriod90;
  return formatMessage(t.adminProfitPeriodDays, { count: periodDays });
}

function formatMargin(value) {
  return value != null ? `${value}%` : '—';
}

function RankList({
  rows,
  rankBy,
  metrics,
  t,
  lang,
  emptyLabel,
  nameOf,
  onOpenOrders,
  onOpenOrder,
}) {
  const [expandedKey, setExpandedKey] = useState(null);

  if (!rows.length) {
    return <p className="admin-dash-empty">{emptyLabel}</p>;
  }

  return (
    <ol className="admin-profit-rank-list">
      {rows.map((row, index) => {
        const key = row.offerId || row.gameId || row.name || String(index);
        const rank = index + 1;
        const expanded = expandedKey === key;
        const primary = rankBy === 'units'
          ? formatMessage(t.adminProfitRankUnitsValue, { count: row.units })
          : rankBy === 'revenue'
            ? metrics.formatUsd(row.revenue)
            : metrics.formatUsd(row.profit);
        const buyers = row.buyerList || [];

        return (
          <li
            key={key}
            className={`admin-profit-rank-row admin-profit-rank-row--expandable${expanded ? ' admin-profit-rank-row--open' : ''}`}
          >
            <button
              type="button"
              className="admin-profit-rank-row__toggle"
              aria-expanded={expanded}
              onClick={() => setExpandedKey(expanded ? null : key)}
            >
              <span
                className={`admin-profit-top-row__rank${rank <= 3 ? ` admin-profit-top-row__rank--${rank}` : ''}`}
              >
                {rank}
              </span>
              <div className="admin-profit-rank-row__body">
                <span className="admin-profit-rank-row__name">{nameOf(row)}</span>
                {!expanded ? (
                  <span className="admin-profit-rank-row__meta">
                    {formatMessage(t.adminProfitRankTeaser, {
                      revenue: metrics.formatUsd(row.revenue),
                      units: row.units,
                      buyers: row.buyerCount ?? buyers.length,
                    })}
                  </span>
                ) : null}
              </div>
              <span className="admin-profit-rank-row__primary" dir="ltr">{primary}</span>
              <ChevronDown
                className={`admin-profit-rank-row__chevron${expanded ? ' admin-profit-rank-row__chevron--open' : ''}`}
                aria-hidden
              />
            </button>
            {expanded ? (
              <div className="admin-profit-rank-row__details">
                <div className="admin-profit-customer-summary">
                  <span>
                    {t.adminProfitLegendRevenue}
                    {': '}
                    <strong dir="ltr">{metrics.formatUsd(row.revenue)}</strong>
                  </span>
                  <span>
                    {t.adminProfitLegendCost}
                    {': '}
                    <strong dir="ltr">{metrics.formatUsd(row.cost)}</strong>
                  </span>
                  <span>
                    {t.adminProfitLegendProfit}
                    {': '}
                    <strong dir="ltr">{metrics.formatUsd(row.profit)}</strong>
                  </span>
                  <span>
                    {t.adminProfitRankByUnits}
                    {': '}
                    <strong dir="ltr">{row.units}</strong>
                  </span>
                  <span>
                    {t.adminProfitBuyersLabel}
                    {': '}
                    <strong dir="ltr">{row.buyerCount ?? buyers.length}</strong>
                  </span>
                </div>

                {buyers.length === 0 ? (
                  <p className="admin-dash-empty">{t.adminProfitBuyersEmpty}</p>
                ) : (
                  <ul className="admin-profit-customer-orders admin-profit-buyers-list">
                    {buyers.map((buyer, buyerIndex) => {
                      const displayName = buyer.name || buyer.label || '—';
                      const usernameLabel = buyer.username
                        ? (buyer.username.startsWith('@') ? buyer.username : `@${buyer.username}`)
                        : null;
                      const canOpen = Boolean(buyer.username && onOpenOrders);
                      const purchases = buyer.purchases || [];

                      return (
                        <li
                          key={buyer.userId || buyerIndex}
                          className="admin-profit-customer-order admin-profit-buyer"
                        >
                          <div className="admin-profit-buyer__head">
                            <div className="admin-profit-buyer__identity">
                              {canOpen ? (
                                <button
                                  type="button"
                                  className="admin-profit-customer-row__name-btn"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenOrders(buyer);
                                  }}
                                >
                                  {displayName}
                                </button>
                              ) : (
                                <span className="admin-profit-rank-row__name">{displayName}</span>
                              )}
                              {usernameLabel ? (
                                <span className="admin-profit-customer-row__secondary" dir="ltr">
                                  {usernameLabel}
                                </span>
                              ) : null}
                            </div>
                            <span className="admin-profit-buyer__orders-count">
                              {formatMessage(t.adminProfitCustomerOrdersValue, { count: buyer.orders })}
                            </span>
                          </div>

                          <div className="admin-profit-customer-order__money">
                            <span>
                              <em>{t.adminProfitOrderPrice}</em>
                              <strong dir="ltr">{metrics.formatUsd(buyer.revenue)}</strong>
                            </span>
                            <span>
                              <em>{t.adminProfitLegendCost}</em>
                              <strong dir="ltr">{metrics.formatUsd(buyer.cost)}</strong>
                            </span>
                            <span className="admin-profit-customer-order__profit">
                              <em>{t.adminProfitLegendProfit}</em>
                              <strong dir="ltr">{metrics.formatUsd(buyer.profit)}</strong>
                            </span>
                            <span>
                              <em>{t.adminProfitRankByUnits}</em>
                              <strong dir="ltr">{buyer.units}</strong>
                            </span>
                          </div>

                          {purchases.length > 0 ? (
                            <ul className="admin-profit-customer-order__lines">
                              {purchases.map((purchase, purchaseIndex) => {
                                const purchaseDate = purchase.createdAt
                                  ? formatDate(purchase.createdAt, lang, {
                                    year: 'numeric',
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })
                                  : '—';
                                const canOpenOrder = Boolean(purchase.orderId && onOpenOrder);
                                return (
                                  <li key={purchase.orderId || `${buyer.userId}-${purchaseIndex}`}>
                                    <span className="admin-profit-customer-order__line-name">
                                      {canOpenOrder ? (
                                        <button
                                          type="button"
                                          className="admin-profit-order-link"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            onOpenOrder(purchase.orderId, buyer.username);
                                          }}
                                        >
                                          {purchaseDate}
                                          {purchase.units > 1 ? ` · ×${purchase.units}` : ''}
                                          {' · '}
                                          <span dir="ltr">#{String(purchase.orderId).slice(0, 8)}</span>
                                        </button>
                                      ) : (
                                        <>
                                          {purchaseDate}
                                          {purchase.units > 1 ? ` · ×${purchase.units}` : ''}
                                        </>
                                      )}
                                    </span>
                                    <span className="admin-profit-customer-order__line-money" dir="ltr">
                                      {metrics.formatUsd(purchase.revenue)}
                                      {' · '}
                                      <span className="admin-profit-customer-order__line-profit">
                                        {metrics.formatUsd(purchase.profit)}
                                      </span>
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function CustomerRankList({
  rows,
  rankBy,
  metrics,
  t,
  lang,
  emptyLabel,
  onOpenOrders,
  onOpenOrder,
}) {
  const [expandedKey, setExpandedKey] = useState(null);

  if (!rows.length) {
    return <p className="admin-dash-empty">{emptyLabel}</p>;
  }

  return (
    <ol className="admin-profit-rank-list">
      {rows.map((row, index) => {
        const key = row.userId || String(index);
        const rank = index + 1;
        const expanded = expandedKey === key;
        const primary = rankBy === 'orders'
          ? formatMessage(t.adminProfitCustomerOrdersValue, { count: row.orders })
          : rankBy === 'profit'
            ? metrics.formatUsd(row.profit)
            : metrics.formatUsd(row.revenue);
        const displayName = row.name || row.label || '—';
        const usernameLabel = row.username
          ? (row.username.startsWith('@') ? row.username : `@${row.username}`)
          : null;
        const canOpen = Boolean(row.username && onOpenOrders);
        const orderList = row.orderList || [];

        return (
          <li
            key={key}
            className={`admin-profit-rank-row admin-profit-customer-row admin-profit-rank-row--expandable${expanded ? ' admin-profit-rank-row--open' : ''}`}
          >
            <button
              type="button"
              className="admin-profit-rank-row__toggle"
              aria-expanded={expanded}
              onClick={() => setExpandedKey(expanded ? null : key)}
            >
              <span
                className={`admin-profit-top-row__rank${rank <= 3 ? ` admin-profit-top-row__rank--${rank}` : ''}`}
              >
                {rank}
              </span>
              <div className="admin-profit-rank-row__body">
                <span className="admin-profit-rank-row__name">{displayName}</span>
                {usernameLabel ? (
                  <span className="admin-profit-customer-row__secondary" dir="ltr">{usernameLabel}</span>
                ) : null}
                {!expanded ? (
                  <span className="admin-profit-rank-row__meta">
                    {formatMessage(t.adminProfitCustomerTeaser, {
                      orders: row.orders,
                      revenue: metrics.formatUsd(row.revenue),
                    })}
                  </span>
                ) : null}
              </div>
              <span className="admin-profit-rank-row__primary" dir="ltr">{primary}</span>
              <ChevronDown
                className={`admin-profit-rank-row__chevron${expanded ? ' admin-profit-rank-row__chevron--open' : ''}`}
                aria-hidden
              />
            </button>
            {expanded ? (
              <div className="admin-profit-rank-row__details">
                <div className="admin-profit-customer-summary">
                  <span>
                    {t.adminProfitLegendRevenue}
                    {': '}
                    <strong dir="ltr">{metrics.formatUsd(row.revenue)}</strong>
                  </span>
                  <span>
                    {t.adminProfitLegendProfit}
                    {': '}
                    <strong dir="ltr">{metrics.formatUsd(row.profit)}</strong>
                  </span>
                  <span>
                    {t.adminProfitMargin}
                    {': '}
                    <strong dir="ltr">{formatMargin(row.marginPercent)}</strong>
                  </span>
                </div>

                {orderList.length === 0 ? (
                  <p className="admin-dash-empty">{t.adminProfitCustomerOrdersEmpty}</p>
                ) : (
                  <ul className="admin-profit-customer-orders">
                    {orderList.map((order, orderIndex) => {
                      const orderDate = order.createdAt
                        ? formatDate(order.createdAt, lang, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                        : '—';
                      const itemNames = (order.items || [])
                        .map((item) => (
                          item.units > 1
                            ? `${item.name} ×${item.units}`
                            : item.name
                        ))
                        .filter(Boolean)
                        .join(' · ') || '—';

                      return (
                        <li
                          key={order.orderId || `${key}-${orderIndex}`}
                          className="admin-profit-customer-order"
                        >
                          <div className="admin-profit-customer-order__head">
                            <span className="admin-profit-customer-order__date">{orderDate}</span>
                            {order.orderId ? (
                              onOpenOrder ? (
                                <button
                                  type="button"
                                  className="admin-profit-customer-order__id admin-profit-order-link"
                                  dir="ltr"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    onOpenOrder(order.orderId, row.username);
                                  }}
                                >
                                  #{String(order.orderId).slice(0, 8)}
                                </button>
                              ) : (
                                <span className="admin-profit-customer-order__id" dir="ltr">
                                  #{String(order.orderId).slice(0, 8)}
                                </span>
                              )
                            ) : null}
                          </div>
                          <p className="admin-profit-customer-order__items">{itemNames}</p>
                          <div className="admin-profit-customer-order__money">
                            <span>
                              <em>{t.adminProfitOrderPrice}</em>
                              <strong dir="ltr">{metrics.formatUsd(order.revenue)}</strong>
                            </span>
                            <span>
                              <em>{t.adminProfitLegendCost}</em>
                              <strong dir="ltr">{metrics.formatUsd(order.cost)}</strong>
                            </span>
                            <span className="admin-profit-customer-order__profit">
                              <em>{t.adminProfitLegendProfit}</em>
                              <strong dir="ltr">{metrics.formatUsd(order.profit)}</strong>
                            </span>
                          </div>
                          {(order.items || []).length > 1 ? (
                            <ul className="admin-profit-customer-order__lines">
                              {order.items.map((item, itemIndex) => (
                                <li key={item.offerId || `${orderIndex}-${itemIndex}`}>
                                  <span className="admin-profit-customer-order__line-name">
                                    {item.name}
                                    {item.units > 1 ? ` ×${item.units}` : ''}
                                  </span>
                                  <span className="admin-profit-customer-order__line-money" dir="ltr">
                                    {metrics.formatUsd(item.revenue)}
                                    {' · '}
                                    <span className="admin-profit-customer-order__line-profit">
                                      {metrics.formatUsd(item.profit)}
                                    </span>
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                )}

                {canOpen ? (
                  <button
                    type="button"
                    className="admin-profit-customer-row__orders-btn"
                    onClick={(event) => {
                      event.stopPropagation();
                      onOpenOrders(row);
                    }}
                  >
                    {t.adminProfitCustomerViewOrders}
                  </button>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function MoneyFlow({ metrics, t }) {
  const total = Math.max(metrics.totalRevenue, 0.01);
  const costPct = Math.min(100, (metrics.supplierCost / total) * 100);
  const profitPct = Math.min(100, Math.max(0, (metrics.grossProfit / total) * 100));

  return (
    <div className="admin-profit-flow">
      <div className="admin-profit-flow__step admin-profit-flow__step--revenue">
        <span className="admin-profit-flow__label">{t.adminProfitFlowIn}</span>
        <span className="admin-profit-flow__value" dir="ltr">{metrics.formatUsd(metrics.totalRevenue)}</span>
        <span className="admin-profit-flow__hint">{t.adminProfitLegendRevenue}</span>
      </div>
      <div className="admin-profit-flow__arrow" aria-hidden>
        <ArrowRightLeft className="w-4 h-4" />
      </div>
      <div className="admin-profit-flow__step admin-profit-flow__step--cost">
        <span className="admin-profit-flow__label">{t.adminProfitFlowOut}</span>
        <span className="admin-profit-flow__value" dir="ltr">{metrics.formatUsd(metrics.supplierCost)}</span>
        <span className="admin-profit-flow__hint">
          {formatMessage(t.adminProfitFlowShare, { pct: costPct.toFixed(0) })}
        </span>
      </div>
      <div className="admin-profit-flow__arrow" aria-hidden>
        <ArrowRightLeft className="w-4 h-4" />
      </div>
      <div className="admin-profit-flow__step admin-profit-flow__step--profit">
        <span className="admin-profit-flow__label">{t.adminProfitFlowKeep}</span>
        <span className="admin-profit-flow__value" dir="ltr">{metrics.formatUsd(metrics.grossProfit)}</span>
        <span className="admin-profit-flow__hint">
          {formatMessage(t.adminProfitFlowShare, { pct: profitPct.toFixed(0) })}
        </span>
      </div>
    </div>
  );
}

export default function AdminProfitStatsPage({
  orders = [],
  offers = [],
  games = [],
  t = {},
  lang = 'ar',
  loadingOrders = false,
}) {
  const navigate = useNavigate();
  const [periodDays, setPeriodDays] = useState(7);
  const [chartView, setChartView] = useState('grouped');
  const [rankBy, setRankBy] = useState('units');
  const [customerRankBy, setCustomerRankBy] = useState('revenue');

  const metrics = useMemo(
    () => computeAdminProfitMetrics(orders, offers, {
      periodDays,
      chartDays: periodDays == null ? 30 : periodDays,
      games,
      lang,
      topLimit: 12,
    }),
    [orders, offers, games, periodDays, lang],
  );

  const marginLabel = metrics.marginPercent != null ? `${metrics.marginPercent}%` : '—';
  const catalogMarginLabel = metrics.catalogMarginPercent != null
    ? `${metrics.catalogMarginPercent}%`
    : '—';

  const topSellers = rankBy === 'profit'
    ? metrics.topOffersByProfit
    : rankBy === 'revenue'
      ? metrics.topOffersByRevenue
      : metrics.topOffersByUnits;

  const topCustomers = customerRankBy === 'orders'
    ? metrics.topCustomersByOrders
    : customerRankBy === 'profit'
      ? metrics.topCustomersByProfit
      : metrics.topCustomersByRevenue;

  const rangeLabel = periodLabel(periodDays, t);

  const openCustomerOrders = (row) => {
    if (!row?.username) return;
    navigate(getAdminOrdersPath({ username: row.username }));
  };

  const openOrder = (orderId, username = '') => {
    if (!orderId) return;
    navigate(getAdminOrdersPath({
      orderId,
      username: username || '',
    }));
  };

  if (loadingOrders) {
    return (
      <div className="admin-profit-page">
        <p className="admin-dash-empty">{t.loadingOrders}</p>
      </div>
    );
  }

  return (
    <div className="admin-profit-page space-y-6 sm:space-y-8">
      {/* Period + legend */}
      <AdminDashSection
        title={t.adminProfitStatsTitle}
        description={t.adminProfitStatsSubtitle}
        className="admin-dash-section--profit"
        icon={TrendingUp}
        action={(
          <div className="admin-profit-period" role="group" aria-label={t.adminProfitPeriodLabel}>
            <CalendarRange className="w-4 h-4 admin-profit-period__icon" aria-hidden />
            {PROFIT_PERIOD_OPTIONS.map((days) => {
              const active = periodDays === days;
              const label = periodLabel(days, t);
              return (
                <button
                  key={days == null ? 'all' : days}
                  type="button"
                  onClick={() => setPeriodDays(days)}
                  className={`admin-profit-period__btn${active ? ' admin-profit-period__btn--active' : ''}`}
                  aria-pressed={active}
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      >
        <p className="admin-profit-period-note">
          {formatMessage(t.adminProfitPeriodActive, { range: rangeLabel })}
        </p>
      </AdminDashSection>

      {/* KPI grid */}
      <div className="admin-dash-grid admin-dash-grid--profit-stats">
        <AdminDashStatCard
          tone="revenue"
          label={t.adminProfitLegendRevenue}
          value={metrics.formatUsd(metrics.totalRevenue)}
          help={t.adminProfitStatsRevenueHelp}
          icon={DollarSign}
        />
        <AdminDashStatCard
          tone="cost"
          label={t.adminProfitSupplierCost}
          value={metrics.formatUsd(metrics.supplierCost)}
          help={t.adminProfitSupplierCostHelp}
          icon={Package}
        />
        <AdminDashStatCard
          tone="profit"
          label={t.adminProfitGross}
          value={metrics.formatUsd(metrics.grossProfit)}
          help={t.adminProfitGrossHelp}
          icon={TrendingUp}
        />
        <AdminDashStatCard
          tone="margin"
          label={t.adminProfitMargin}
          value={marginLabel}
          help={t.adminProfitMarginHelp}
          icon={Percent}
        />
        <AdminDashStatCard
          tone="orders"
          label={t.adminProfitStatsOrders}
          value={metrics.completedOrders}
          help={t.adminProfitStatsOrdersHelp}
          icon={ShoppingCart}
        />
        <AdminDashStatCard
          tone="catalog"
          label={t.avgOrderValue}
          value={metrics.formatUsd(metrics.avgOrderValue)}
          help={t.adminProfitStatsAovHelp}
          icon={BarChart3}
        />
      </div>

      {metrics.untrackedRevenue > 0 ? (
        <div className="admin-profit-alert" role="status">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm leading-relaxed">
            {formatMessage(t.adminProfitUntrackedWarning, {
              amount: metrics.formatUsd(metrics.untrackedRevenue),
            })}
          </p>
        </div>
      ) : null}

      {/* Money flow */}
      <AdminDashSection
        title={t.adminProfitFlowTitle}
        description={t.adminProfitFlowDesc}
        icon={ArrowRightLeft}
      >
        <MoneyFlow metrics={metrics} t={t} />
      </AdminDashSection>

      {/* Charts */}
      <AdminDashSection
        title={t.adminProfitChartTitle}
        description={t.adminProfitStatsChartDesc}
        icon={BarChart3}
        action={(
          <div className="admin-profit-legend" aria-hidden>
            <span className="admin-profit-legend__item">
              <span className="admin-profit-legend__swatch admin-profit-legend__swatch--revenue" />
              {t.adminProfitLegendRevenue}
            </span>
            <span className="admin-profit-legend__item">
              <span className="admin-profit-legend__swatch admin-profit-legend__swatch--cost" />
              {t.adminProfitLegendCost}
            </span>
            <span className="admin-profit-legend__item">
              <span className="admin-profit-legend__swatch admin-profit-legend__swatch--profit" />
              {t.adminProfitLegendProfit}
            </span>
          </div>
        )}
      >
        <ProfitChartPanel
          chartView={chartView}
          onChartViewChange={setChartView}
          metrics={metrics}
          t={t}
          rangeLabel={rangeLabel}
          scrollable={metrics.chartDayCount > 14}
        />
      </AdminDashSection>

      {/* Bestsellers */}
      <AdminDashSection
        title={t.adminProfitTopSellers}
        description={t.adminProfitTopSellersDesc}
        icon={Trophy}
        action={(
          <div className="admin-profit-rank-switch" role="tablist" aria-label={t.adminProfitRankByLabel}>
            {RANK_TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={rankBy === id}
                onClick={() => setRankBy(id)}
                className={`admin-profit-rank-switch__btn${rankBy === id ? ' admin-profit-rank-switch__btn--active' : ''}`}
              >
                {t[labelKey]}
              </button>
            ))}
          </div>
        )}
      >
        <RankList
          rows={topSellers}
          rankBy={rankBy}
          metrics={metrics}
          t={t}
          lang={lang}
          emptyLabel={t.adminProfitRankEmpty}
          nameOf={(row) => row.name}
          onOpenOrders={openCustomerOrders}
          onOpenOrder={openOrder}
        />
      </AdminDashSection>

      {/* Top customers */}
      <AdminDashSection
        title={t.adminProfitTopCustomers}
        description={formatMessage(t.adminProfitTopCustomersDesc, {
          count: metrics.uniqueCustomers,
        })}
        icon={Users}
        action={(
          <div className="admin-profit-rank-switch" role="tablist" aria-label={t.adminProfitRankByLabel}>
            {CUSTOMER_RANK_TABS.map(({ id, labelKey }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={customerRankBy === id}
                onClick={() => setCustomerRankBy(id)}
                className={`admin-profit-rank-switch__btn${customerRankBy === id ? ' admin-profit-rank-switch__btn--active' : ''}`}
              >
                {t[labelKey]}
              </button>
            ))}
          </div>
        )}
      >
        <CustomerRankList
          rows={topCustomers}
          rankBy={customerRankBy}
          metrics={metrics}
          t={t}
          lang={lang}
          emptyLabel={t.adminProfitCustomerEmpty}
          onOpenOrders={openCustomerOrders}
          onOpenOrder={openOrder}
        />
      </AdminDashSection>

      {/* Daily review table */}
      <AdminDashSection
        title={t.adminProfitDailyTitle}
        description={t.adminProfitDailyDesc}
        icon={ListOrdered}
      >
        {metrics.dailyReview.length === 0 ? (
          <p className="admin-dash-empty">{t.adminProfitChartEmpty}</p>
        ) : (
          <div className="admin-profit-table-wrap">
            <table className="admin-profit-table">
              <thead>
                <tr>
                  <th scope="col">{t.adminProfitDailyDate}</th>
                  <th scope="col">{t.adminProfitStatsOrders}</th>
                  <th scope="col">{t.adminProfitLegendRevenue}</th>
                  <th scope="col">{t.adminProfitLegendCost}</th>
                  <th scope="col">{t.adminProfitLegendProfit}</th>
                  <th scope="col">{t.adminProfitMargin}</th>
                </tr>
              </thead>
              <tbody>
                {metrics.dailyReview.map((day) => (
                  <tr key={day.key}>
                    <td>
                      <span className="admin-profit-table__date">
                        <ListOrdered className="w-3.5 h-3.5 opacity-50" aria-hidden />
                        {day.label}
                      </span>
                    </td>
                    <td dir="ltr">{day.orders}</td>
                    <td dir="ltr">{metrics.formatUsd(day.revenue)}</td>
                    <td dir="ltr">{metrics.formatUsd(day.cost)}</td>
                    <td dir="ltr" className="admin-profit-table__profit">
                      {metrics.formatUsd(day.profit)}
                    </td>
                    <td dir="ltr">
                      {day.marginPercent != null ? `${day.marginPercent}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <th scope="row">{t.adminProfitDailyTotal}</th>
                  <td dir="ltr">{metrics.completedOrders}</td>
                  <td dir="ltr">{metrics.formatUsd(metrics.totalRevenue)}</td>
                  <td dir="ltr">{metrics.formatUsd(metrics.supplierCost)}</td>
                  <td dir="ltr" className="admin-profit-table__profit">
                    {metrics.formatUsd(metrics.grossProfit)}
                  </td>
                  <td dir="ltr">{marginLabel}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </AdminDashSection>

      {/* Catalog margin note */}
      <p className="admin-profit-footnote">
        {formatMessage(t.adminProfitCatalogMarginHelp, {
          count: metrics.catalogOffersWithCost,
        })}
        {' · '}
        <span dir="ltr">{catalogMarginLabel}</span>
        {' '}
        {t.adminProfitCatalogMargin}
      </p>
    </div>
  );
}
