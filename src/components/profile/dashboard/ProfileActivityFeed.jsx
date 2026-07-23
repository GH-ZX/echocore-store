import { Activity, ShoppingBag, Wallet, ArrowLeftRight } from 'lucide-react';
import { activityTone, buildCustomerActivityFeed } from '../../../lib/activityMonitor';
import { formatMoney } from '../../../lib/userDashboard';

function formatWhen(iso, lang) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function KindIcon({ kind }) {
  if (kind === 'order') return <ShoppingBag className="w-4 h-4 shrink-0" />;
  if (kind === 'recharge') return <Wallet className="w-4 h-4 shrink-0" />;
  return <ArrowLeftRight className="w-4 h-4 shrink-0" />;
}

const TONE_CLASS = {
  success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100',
  warning: 'border-amber-500/25 bg-amber-500/10 text-amber-50',
  danger: 'border-red-500/30 bg-red-500/10 text-red-100',
  info: 'border-[var(--border)] bg-[var(--surface)] text-[var(--text)]',
};

export default function ProfileActivityFeed({
  t = {},
  lang = 'ar',
  orders = [],
  recharges = [],
  transactions = [],
  navigate,
  onGoTab,
  limit = 12,
}) {
  const feed = buildCustomerActivityFeed({ orders, recharges, transactions, limit });

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="font-bold text-lg flex items-center gap-2 min-w-0">
          <Activity className="w-5 h-5 text-[var(--accent)] shrink-0" />
          <span className="truncate">{t.activityTitle || t.myOrders}</span>
        </h2>
        <button
          type="button"
          onClick={() => onGoTab?.('orders')}
          className="text-xs text-[var(--accent)] font-semibold hover:underline shrink-0"
        >
          {t.dashViewAllOrders}
        </button>
      </div>

      {feed.length === 0 ? (
        <p className="text-sm text-[var(--text-sec)]">{t.activityEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {feed.map((item) => {
            const tone = activityTone(item.kind, item.status);
            const label = t[item.labelKey] || item.kind;
            const statusLabel = item.status
              ? (t[`orderStatus_${item.status}`] || t[item.status] || item.status)
              : '';
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (item.orderId && navigate) {
                      navigate(`/success?orderId=${item.orderId}`);
                      return;
                    }
                    if (item.kind === 'recharge') onGoTab?.('wallet');
                    else onGoTab?.('orders');
                  }}
                  className={`w-full text-start rounded-xl border px-3 py-2.5 flex items-start gap-3 transition-colors hover:brightness-110 ${TONE_CLASS[tone] || TONE_CLASS.info}`}
                >
                  <KindIcon kind={item.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-xs font-mono opacity-90" dir="ltr">
                        {item.amount != null && item.amount !== '' ? formatMoney(item.amount) : ''}
                      </span>
                    </span>
                    <span className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] opacity-80">
                      {statusLabel ? <span>{statusLabel}</span> : null}
                      <span dir="ltr">{item.ref}</span>
                      <span dir="ltr">{formatWhen(item.createdAt, lang)}</span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
