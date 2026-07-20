import { Layers, Columns3, Activity } from 'lucide-react';
import { formatMessage } from '../../lib/i18n';

/** 3 chart modes so admin can read مرابح clearly */
export const CHART_VIEWS = [
  { id: 'stacked', labelKey: 'adminProfitViewStacked', icon: Layers },
  { id: 'grouped', labelKey: 'adminProfitViewGrouped', icon: Columns3 },
  { id: 'profit', labelKey: 'adminProfitViewProfit', icon: Activity },
];

export function ChartViewSwitcher({ view, onChange, t }) {
  return (
    <div className="admin-profit-view-switch" role="tablist" aria-label={t.adminProfitChartViews}>
      {CHART_VIEWS.map(({ id, labelKey, icon: Icon }) => {
        const active = view === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(id)}
            className={`admin-profit-view-switch__btn${active ? ' admin-profit-view-switch__btn--active' : ''}`}
          >
            <Icon className="w-3.5 h-3.5" strokeWidth={2.25} aria-hidden />
            <span>{t[labelKey] || id}</span>
          </button>
        );
      })}
    </div>
  );
}

export function StackedChart({ days, metrics, t }) {
  return (
    <div
      className="admin-profit-chart"
      role="img"
      aria-label={t.adminProfitViewStacked}
      dir="ltr"
      style={{ '--chart-days': days.length }}
    >
      {days.map((day) => (
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
            <span className="admin-profit-chart__label">{day.labelShort || day.label}</span>
            {day.orders > 0 ? (
              <span className="admin-profit-chart__orders">
                {formatMessage(t.adminProfitDayOrders, { count: day.orders })}
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

export function GroupedChart({ days, metrics, t }) {
  const maxVal = Math.max(
    ...days.flatMap((d) => [d.revenue, d.cost, Math.max(d.profit, 0)]),
    0.01,
  );

  return (
    <div
      className="admin-profit-chart admin-profit-chart--grouped"
      role="img"
      aria-label={t.adminProfitViewGrouped}
      dir="ltr"
      style={{ '--chart-days': days.length }}
    >
      {days.map((day) => {
        const revH = Math.max(4, (day.revenue / maxVal) * 100);
        const costH = Math.max(day.cost > 0 ? 4 : 0, (day.cost / maxVal) * 100);
        const profitH = Math.max(day.profit > 0 ? 4 : 0, (Math.max(day.profit, 0) / maxVal) * 100);
        return (
          <div key={day.key} className="admin-profit-chart__col admin-profit-chart__col--grouped">
            <div className="admin-profit-grouped-bars">
              <div
                className="admin-profit-grouped-bar admin-profit-grouped-bar--revenue"
                style={{ height: `${revH}%` }}
                title={`${t.adminProfitLegendRevenue}: ${metrics.formatUsd(day.revenue)}`}
              />
              <div
                className="admin-profit-grouped-bar admin-profit-grouped-bar--cost"
                style={{ height: `${costH}%` }}
                title={`${t.adminProfitLegendCost}: ${metrics.formatUsd(day.cost)}`}
              />
              <div
                className="admin-profit-grouped-bar admin-profit-grouped-bar--profit"
                style={{ height: `${profitH}%` }}
                title={`${t.adminProfitLegendProfit}: ${metrics.formatUsd(day.profit)}`}
              />
            </div>
            <div className="admin-profit-chart__meta">
              <span className="admin-profit-chart__value admin-profit-chart__value--profit" dir="ltr">
                {metrics.formatUsd(day.profit)}
              </span>
              <span className="admin-profit-chart__label">{day.labelShort || day.label}</span>
              {day.orders > 0 ? (
                <span className="admin-profit-chart__orders">
                  {formatMessage(t.adminProfitDayOrders, { count: day.orders })}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ProfitTrendChart({ days, metrics, t }) {
  const maxProfit = Math.max(...days.map((d) => Math.max(d.profit, 0)), 0.01);
  const points = days.map((day, i) => {
    const x = days.length <= 1 ? 50 : (i / (days.length - 1)) * 100;
    const y = 100 - Math.max(2, (Math.max(day.profit, 0) / maxProfit) * 92);
    return { x, y, day };
  });
  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `0,100 ${polyline} 100,100`;

  return (
    <div
      className="admin-profit-trend"
      role="img"
      aria-label={t.adminProfitViewProfit}
      dir="ltr"
      style={{ '--chart-days': days.length }}
    >
      <div className="admin-profit-trend__plot" dir="ltr">
        <svg
          className="admin-profit-trend__svg"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          aria-hidden
        >
          <defs>
            <linearGradient id="adminProfitTrendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--dash-profit, #4ade80)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--dash-profit, #4ade80)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {[25, 50, 75].map((y) => (
            <line
              key={y}
              x1="0"
              y1={y}
              x2="100"
              y2={y}
              className="admin-profit-trend__grid"
            />
          ))}
          <polygon points={area} fill="url(#adminProfitTrendFill)" />
          <polyline
            points={polyline}
            fill="none"
            stroke="var(--dash-profit, #4ade80)"
            strokeWidth="1.8"
            vectorEffect="non-scaling-stroke"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((p) => (
            <circle
              key={p.day.key}
              cx={p.x}
              cy={p.y}
              r="1.6"
              className="admin-profit-trend__dot"
              vectorEffect="non-scaling-stroke"
            >
              <title>
                {`${p.day.label}: ${metrics.formatUsd(p.day.profit)}`}
              </title>
            </circle>
          ))}
        </svg>
      </div>
      <div
        className="admin-profit-trend__axis"
        dir="ltr"
        style={{ '--chart-days': days.length }}
      >
        {days.map((day) => (
          <div key={day.key} className="admin-profit-trend__tick" dir="ltr">
            <span className="admin-profit-chart__value admin-profit-chart__value--profit" dir="ltr">
              {metrics.formatUsd(day.profit)}
            </span>
            <span className="admin-profit-chart__label" dir="ltr">{day.labelShort || day.label}</span>
            {day.revenue > 0 ? (
              <span className="admin-profit-chart__orders" dir="ltr">
                {day.profitPct != null ? `${day.profitPct}%` : ''}
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProfitChartPanel({
  chartView,
  onChartViewChange,
  metrics,
  t,
  title,
  rangeLabel,
  scrollable = false,
}) {
  const hasChartData = metrics.chartDays.some((day) => day.orders > 0);
  const chartTitle = title
    || (chartView === 'profit'
      ? (t.adminProfitViewProfitTitle || t.adminProfitChartTitle)
      : chartView === 'grouped'
        ? (t.adminProfitViewGroupedTitle || t.adminProfitChartTitle)
        : t.adminProfitChartTitle);

  return (
    <div className="admin-profit-chart-panel">
      <div className="admin-profit-chart-panel__head admin-profit-chart-panel__head--wrap">
        <div className="min-w-0">
          <h3 className="admin-profit-chart-panel__title">{chartTitle}</h3>
          {rangeLabel ? (
            <span className="admin-profit-chart-panel__range">{rangeLabel}</span>
          ) : null}
        </div>
        <ChartViewSwitcher view={chartView} onChange={onChartViewChange} t={t} />
      </div>

      {!hasChartData ? (
        <p className="admin-dash-empty">{t.adminProfitChartEmpty}</p>
      ) : (
        <div
          className={scrollable ? 'admin-profit-chart-scroll' : undefined}
          dir="ltr"
          style={{ '--chart-days': metrics.chartDays.length }}
        >
          {chartView === 'grouped' ? (
            <GroupedChart days={metrics.chartDays} metrics={metrics} t={t} />
          ) : chartView === 'profit' ? (
            <ProfitTrendChart days={metrics.chartDays} metrics={metrics} t={t} />
          ) : (
            <StackedChart days={metrics.chartDays} metrics={metrics} t={t} />
          )}
        </div>
      )}
    </div>
  );
}
