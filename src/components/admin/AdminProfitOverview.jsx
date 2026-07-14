import { useMemo } from 'react';
import { TrendingUp, Package, Percent, AlertTriangle, BarChart3 } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';
import { computeAdminProfitMetrics } from '../../lib/adminProfitMetrics';

function StatCard({ label, value, help, icon: Icon, tone = 'default' }) {
  const toneClass = tone === 'success' ? 'dash-stat-card--success' : '';
  const iconTone = tone === 'success' ? 'dash-stat-icon--success' : '';

  return (
    <div className={`dash-stat-card card p-4 sm:p-5 ${toneClass}`.trim()}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[var(--text-sec)] text-sm">{label}</div>
          <div className={`text-2xl sm:text-3xl font-black mt-1 ${tone === 'success' ? 'text-[var(--success)]' : ''}`}>
            {value}
          </div>
          {help ? (
            <p className="text-[10px] text-[var(--text-muted)] mt-1 leading-snug">{help}</p>
          ) : null}
        </div>
        <div className={`dash-stat-icon flex-shrink-0 ${iconTone}`.trim()}>
          <Icon className={`w-6 h-6 sm:w-7 sm:h-7 ${tone === 'success' ? 'text-[var(--success)]' : 'text-[var(--accent)]'}`} />
        </div>
      </div>
    </div>
  );
}

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
    <section className="admin-profit card p-4 sm:p-6 space-y-5" aria-labelledby="admin-profit-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h3 id="admin-profit-heading" className="font-bold text-lg sm:text-xl flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[var(--success)]" />
            {t.adminProfitTitle}
          </h3>
          <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{t.adminProfitSubtitle}</p>
        </div>
        <div className="admin-profit-legend text-[10px] text-[var(--text-muted)] flex flex-wrap gap-3">
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
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label={t.adminProfitGross}
          value={metrics.formatUsd(metrics.grossProfit)}
          help={t.adminProfitGrossHelp}
          icon={TrendingUp}
          tone="success"
        />
        <StatCard
          label={t.adminProfitMargin}
          value={marginLabel}
          help={t.adminProfitMarginHelp}
          icon={Percent}
        />
        <StatCard
          label={t.adminProfitSupplierCost}
          value={metrics.formatUsd(metrics.supplierCost)}
          help={t.adminProfitSupplierCostHelp}
          icon={Package}
        />
        <StatCard
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

      <div className="admin-profit-chart-wrap">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h4 className="font-semibold text-sm text-[var(--text-primary)]">{t.adminProfitChartTitle}</h4>
          <span className="text-[10px] text-[var(--text-muted)]">{t.adminProfitChartRange}</span>
        </div>

        {!hasChartData ? (
          <p className="text-sm text-[var(--text-sec)] py-8 text-center">{t.adminProfitChartEmpty}</p>
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

      {metrics.topOffers.length > 0 ? (
        <div>
          <h4 className="font-semibold text-sm text-[var(--text-primary)] mb-3">{t.adminProfitTopOffers}</h4>
          <div className="admin-profit-top-list space-y-2">
            {metrics.topOffers.map((row) => (
              <div key={`${row.offerId || row.name}-${row.profit}`} className="admin-profit-top-row">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{row.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]" dir="ltr">
                    {formatMessage(t.adminProfitTopOfferMeta, {
                      revenue: metrics.formatUsd(row.revenue),
                      margin: row.marginPercent != null ? `${row.marginPercent}%` : '—',
                    })}
                  </div>
                </div>
                <div className="admin-profit-top-row__profit" dir="ltr">
                  {metrics.formatUsd(row.profit)}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}