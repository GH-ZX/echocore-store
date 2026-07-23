import {
  LayoutDashboard,
  ShoppingBag,
  Wallet,
  Hash,
  Lock,
  MessageSquare,
} from 'lucide-react';
import { DASH_TABS } from '../../../lib/userDashboard';

const ICONS = {
  overview: LayoutDashboard,
  orders: ShoppingBag,
  wallet: Wallet,
  uids: Hash,
  security: Lock,
  support: MessageSquare,
};

export default function ProfileDashTabs({
  t = {},
  active = 'overview',
  onChange,
  counts = {},
}) {
  const labels = {
    overview: t.dashTabOverview,
    orders: t.dashTabOrders,
    wallet: t.dashTabWallet,
    uids: t.dashTabUids,
    security: t.dashTabSecurity,
    support: t.dashTabSupport,
  };

  return (
    <div
      className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
      role="tablist"
      aria-label={t.dashTabsLabel || t.profileTitle}
    >
      {DASH_TABS.map((id) => {
        const Icon = ICONS[id] || LayoutDashboard;
        const selected = active === id;
        const count = counts[id];
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange?.(id)}
            className={`flex items-center gap-1.5 shrink-0 px-3 py-2 rounded-xl text-sm font-semibold transition-colors border ${
              selected
                ? 'bg-[var(--accent)]/15 text-[var(--accent)] border-[var(--accent)]/40'
                : 'border-transparent text-[var(--text-sec)] hover:text-[var(--text)] hover:bg-[var(--bg-primary)]/60'
            }`}
          >
            <Icon className="w-4 h-4 opacity-80" />
            <span>{labels[id] || id}</span>
            {count != null && count > 0 ? (
              <span className="text-[10px] font-mono opacity-70 tabular-nums">{count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
