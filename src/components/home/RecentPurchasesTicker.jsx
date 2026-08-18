import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { useRecentPurchaseActivity } from '../../hooks/useRecentPurchaseActivity';
import { formatMessage } from '../../lib/i18n';

/** Auto-rotating "latest top-ups" strip — anonymized game + time only. */
export default function RecentPurchasesTicker({ t = {}, lang = 'ar', limit = 6 }) {
  const { rows, ready } = useRecentPurchaseActivity({ limit });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (rows.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setIndex((i) => (i + 1) % rows.length);
    }, 4_000);
    return () => window.clearInterval(timer);
  }, [rows.length]);

  if (!ready || rows.length === 0 || !t.tickerItem) return null;

  const item = rows[index % rows.length];
  const game = lang === 'ar'
    ? (item.game_name_ar || item.game_name_en)
    : item.game_name_en;
  const minutes = Math.max(1, Number(item.minutes_ago) || 1);
  const timeAgo = minutes <= 1
    ? t.tickerMinuteAgo
    : formatMessage(t.tickerMinutesAgo, { minutes });
  const text = formatMessage(t.tickerItem, { game, timeAgo });

  return (
    <div
      className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/60 px-3 py-2 mt-3 overflow-hidden"
      role="status"
      aria-live="polite"
    >
      <Activity className="w-4 h-4 text-[var(--accent)] shrink-0" aria-hidden="true" />
      <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)] shrink-0">
        {t.tickerLabel}
      </span>
      <span key={index} className="text-xs text-[var(--text-sec)] truncate font-medium animate-fade-in">
        {text}
      </span>
    </div>
  );
}
