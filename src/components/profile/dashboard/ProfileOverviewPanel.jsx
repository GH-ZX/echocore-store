import {
  ShoppingBag,
  Receipt,
  ArrowUpRight,
  UserRound,
  Inbox,
  MessageSquare,
  ShoppingCart,
  Wallet,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { formatMoney, getPendingOrders } from '../../../lib/userDashboard';
import ProfileOrdersPanel from './ProfileOrdersPanel';
import ProfileActivityFeed from './ProfileActivityFeed';

export default function ProfileOverviewPanel({
  t = {},
  lang = 'ar',
  isAdmin = false,
  userOrders = [],
  recharges = [],
  transactions = [],
  totalSpent = 0,
  totalRecharges = 0,
  balance = 0,
  navigate,
  onRecharge,
  paymentLabel,
  onGoTab,
  supplierStats = null,
}) {
  const pending = getPendingOrders(userOrders);

  const stats = isAdmin
    ? [
      { icon: ShoppingBag, label: t.totalOrders, value: userOrders.length, color: 'text-blue-400' },
      { icon: Receipt, label: t.totalSpent, value: formatMoney(totalSpent), color: 'text-[var(--accent)]' },
      {
        icon: Wallet,
        label: t.supplierWalletBalance,
        value: supplierStats?.value ?? '—',
        color: 'text-emerald-400',
      },
      { icon: UserRound, label: t.accountType, value: t.profileRoleAdmin, color: 'text-violet-400' },
    ]
    : [
      { icon: ShoppingBag, label: t.totalOrders, value: userOrders.length, color: 'text-blue-400' },
      { icon: Receipt, label: t.totalSpent, value: formatMoney(totalSpent), color: 'text-[var(--accent)]' },
      { icon: ArrowUpRight, label: t.totalRecharged, value: formatMoney(totalRecharges), color: 'text-emerald-400' },
      { icon: Wallet, label: t.yourBalance, value: formatMoney(balance), color: 'text-emerald-400' },
    ];

  const quick = isAdmin
    ? [
      { icon: ShieldCheck, label: t.adminDash, path: '/dashboard' },
      { icon: Inbox, label: t.siteInboxTitle, path: '/notifications' },
      { icon: ShoppingCart, label: t.cart, path: '/cart' },
    ]
    : [
      { icon: Inbox, label: t.siteInboxTitle, path: '/notifications' },
      { icon: MessageSquare, label: t.supportMenuLabel, path: '/support' },
      { icon: ShoppingCart, label: t.cart, path: '/cart' },
      { icon: Wallet, label: t.recharge, action: onRecharge },
    ];

  return (
    <div className="space-y-5">
      {!isAdmin && pending.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
          <AlertCircle className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-bold text-amber-50">{t.dashPendingOrdersTitle}</p>
            <p className="text-xs text-amber-100/80 mt-1">
              {String(t.dashPendingOrdersBody || '').replace('{count}', String(pending.length))}
            </p>
            <button
              type="button"
              onClick={() => onGoTab?.('orders')}
              className="text-xs font-semibold text-amber-200 underline mt-2"
            >
              {t.dashViewPending}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-4 sm:p-5">
            <stat.icon className={`w-5 h-5 mb-2 ${stat.color}`} />
            <p className="text-[10px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wide">
              {stat.label}
            </p>
            <p className="text-lg sm:text-xl font-black mt-0.5">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        {quick.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => (action.action ? action.action() : navigate(action.path))}
            className="action-chip w-full"
          >
            <action.icon className="w-4 h-4 flex-shrink-0" />
            <span className="truncate">{action.label}</span>
          </button>
        ))}
      </div>

      {!isAdmin && (
        <ProfileActivityFeed
          t={t}
          lang={lang}
          orders={userOrders}
          recharges={recharges}
          transactions={transactions}
          navigate={navigate}
          onGoTab={onGoTab}
        />
      )}

      <div className="card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-lg flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-[var(--accent)]" />
            {t.myOrders}
          </h2>
          <button
            type="button"
            onClick={() => onGoTab?.('orders')}
            className="text-xs text-[var(--accent)] font-semibold hover:underline"
          >
            {t.dashViewAllOrders}
          </button>
        </div>
        <ProfileOrdersPanel
          t={t}
          lang={lang}
          orders={userOrders}
          navigate={navigate}
          paymentLabel={paymentLabel}
          compact
          onOpenAll={() => onGoTab?.('orders')}
        />
      </div>
    </div>
  );
}
