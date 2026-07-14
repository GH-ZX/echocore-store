import { useMemo } from 'react';
import { TrendingUp, Package, Percent, AlertTriangle, BarChart3 } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import { computeAdminProfitMetrics } from '../../lib/adminProfitMetrics';
import AdminDashSection from './AdminDashSection';
import AdminDashStatCard from './AdminDashStatCard';

export default function AdminProfitOverview({ orders = [], offers = [], t = {} }) {
  const metrics = useMemo(
    () => computeAdminProfitMetrics(orders, offers, { chartDays: 7 }),
    [orders, offers],
  );

  const hasChartData = metrics.chartDays.some((day) => day.orders > 0);
  const marginLabel = metrics.marginPercent != null ? `${metrics.marginPercent}%` : '—';
  const catalogMarginLabel = metrics.catalogMarginPercent != null
    ? `${metrics.catalogMarginPercent}%`
    : '—';

  return (
    <AdminDashSection
      title={t.adminProfitTitle}
      description={t.adminProfitSubtitle}
      className="admin-dash-section--profit"
      action={(
        <div className="admin-profit-legend" aria-label={t.adminProfitTitle}>
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
      <div className="admin-dash-grid admin-dash-grid--profit">
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
          tone="cost"
          label={t.adminProfitSupplierCost}
          value={metrics.formatUsd(metrics.supplierCost)}
          help={t.adminProfitSupplierCostHelp}
          icon={Package}
        />
        <AdminDashStatCard
          tone="catalog"
          label={t.adminProfitCatalogMargin}
          value={catalogMarginLabel}
          help={formatMessage(t.adminProfitCatalogMarginHelp, {
            count: metrics.catalogOffersWithCost,
          })}
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

      <div className="admin-profit-chart-panel">
        <div className="admin-profit-chart-panel__head">
          <h3 className="admin-profit-chart-panel__title">{t.adminProfitChartTitle}</h3>
          <span className="admin-profit-chart-panel__range">{t.adminProfitChartRange}</span>
        </div>

        {!hasChartData ? (
          <p className="admin-dash-empty">{t.adminProfitChartEmpty}</p>
        ) : (
          <div className="admin-profit-chart" role="img" aria-label={t.adminProfitChartTitle}>
            {metrics.chartDays.map((day) => (
              <div key={day.key} className="admin-profit-chart__col">
                <div className="admin-profit-chart__bar-stack" style={{ height: `${day.revenuePct}%` }}>
                  {day.revenue > 0 ? (
                    <>
                      <div
                        className="admin-profit-chart__segment admin-profit-chart__segment--profit"
                        style={{ flexGrow: Math.max(day.profit, 0) }}
                        title={`${t.adminProfitLegendProfit}: ${metrics.formatUsd(day.profit)}`}
                      />
                      <div
                        className="admin-profit-chart__segment admin-profit-chart__segment--cost"
                        style={{ flexGrow: Math.max(day.cost, 0) }}
                        title={`${t.adminProfitLegendCost}: ${metrics.formatUsd(day.cost)}`}
                      />
                    </>
                  ) : (
                    <div className="admin-profit-chart__segment admin-profit-chart__segment--empty" />
                  )}
                </div>
                <div className="admin-profit-chart__meta">
                  <span className="admin-profit-chart__value" dir="ltr">
                    {metrics.formatUsd(day.revenue)}
                  </span>
                  <span className="admin-profit-chart__label">{day.label}</span>
                  {day.orders > 0 ? (
                    <span className="admin-profit-chart__orders">
                      {formatMessage(t.adminProfitDayOrders, { count: day.orders })}
                    </span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </AdminDashSection>
  );
}