import { Zap, BadgeCheck, ShieldCheck, Headset } from 'lucide-react';

const ITEMS = [
  { key: 'trustFastDelivery', icon: Zap },
  { key: 'trustOfficialPrices', icon: BadgeCheck },
  { key: 'trustSecurePayment', icon: ShieldCheck },
  { key: 'trustSupport247', icon: Headset },
];

/** Compact "why us" strip shown directly under the hero carousel. */
export default function TrustStrip({ t = {} }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mt-6 sm:mt-8">
      {ITEMS.map(({ key, icon: Icon }) => (
        <div
          key={key}
          className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/60 px-3 py-2.5 min-w-0"
        >
          <span className="p-1.5 rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] shrink-0">
            <Icon className="w-4 h-4" aria-hidden="true" />
          </span>
          <span className="text-xs sm:text-[13px] font-semibold text-[var(--text-sec)] leading-snug truncate">
            {t[key]}
          </span>
        </div>
      ))}
    </div>
  );
}
