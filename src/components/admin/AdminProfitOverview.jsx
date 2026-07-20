import { useMemo, useState } from 'react';
import {
  TrendingUp,
  Package,
  Percent,
  AlertTriangle,
  BarChart3,
  Trophy,
} from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import { computeAdminProfitMetrics } from '../../lib/adminProfitMetrics';
import AdminDashSection from './AdminDashSection';
import AdminDashStatCard from './AdminDashStatCard';
import AdminDashGoTo from './AdminDashGoTo';
import { ProfitChartPanel } from './AdminProfitCharts';

export default function AdminProfitOverview({
  orders = [],
  offers = [],
  games = [],
  t = {},
  lang = 'ar',
  onOpenFullStats,
}) {
  const [chartView, setChartView] = useState('stacked');

  const metrics = useMemo(
    () => computeAdminProfitMetrics(orders, offers, {
      periodDays: null,
      chartDays: 7,
      games,
      lang,
      topLimit: 5,
    }),
    [orders, offers, games, lang],
  );

  const marginLabel = metrics.marginPercent != null ? `${metrics.marginPercent}%` : '—';
  const catalogMarginLabel = metrics.catalogMarginPercent != null
    ? `${metrics.catalogMarginPercent}%`
    : '—';

  return (
    <AdminDashSection
      title={t.adminProfitTitle}
      description={t.adminProfitSubtitle}
      className="admin-dash-section--profit"
      icon={TrendingUp}
      action={onOpenFullStats ? (
        <AdminDashGoTo
          label={t.adminProfitOpenFullStats}
          onClick={onOpenFullStats}
          lang={lang}
        />
      ) : null}
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

      <div className="admin-profit-legend admin-profit-legend--inline" aria-label={t.adminProfitTitle}>
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

      <ProfitChartPanel
        chartView={chartView}
        onChartViewChange={setChartView}
        metrics={metrics}
        t={t}
        rangeLabel={t.adminProfitChartRange}
      />

      {metrics.topOffers?.length > 0 ? (
        <div className="admin-profit-top">
          <h3 className="admin-profit-top__title">
            <Trophy className="w-4 h-4" aria-hidden />
            {t.adminProfitTopOffers}
          </h3>
          <ol className="admin-profit-top-list">
            {metrics.topOffers.map((row, index) => (
              <li key={row.offerId || row.name} className="admin-profit-top-row">
                <span
                  className={`admin-profit-top-row__rank${index < 3 ? ` admin-profit-top-row__rank--${index + 1}` : ''}`}
                >
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-sm truncate">{row.name}</div>
                  <div className="text-xs text-[var(--text-sec)]">
                    {formatMessage(t.adminProfitTopOfferMeta, {
                      revenue: metrics.formatUsd(row.revenue),
                      margin: row.marginPercent != null ? `${row.marginPercent}%` : '—',
                    })}
                  </div>
                </div>
                <span className="admin-profit-top-row__profit" dir="ltr">
                  {metrics.formatUsd(row.profit)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </AdminDashSection>
  );
}
