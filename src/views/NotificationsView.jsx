import { useEffect, useCallback } from 'react';
import { Bell, CheckCheck, Trash2, Loader2, Inbox } from 'lucide-react';
import {
  formatNotification,
  getNotificationDestination,
} from '../lib/notifications';

function relativeTime(dateStr, lang) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return lang === 'ar' ? 'الآن' : 'Just now';
  if (mins < 60) return lang === 'ar' ? `منذ ${mins} د` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return lang === 'ar' ? `منذ ${hours} س` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return lang === 'ar' ? `منذ ${days} ي` : `${days}d ago`;
}

const toneClasses = {
  warning: 'border-amber-500/30 bg-amber-500/8',
  success: 'border-emerald-500/30 bg-emerald-500/8',
  danger: 'border-red-500/30 bg-red-500/8',
  info: 'border-sky-500/25 bg-sky-500/6',
};

export default function NotificationsView({
  t = {},
  lang = 'ar',
  user,
  notifications = [],
  unreadCount = 0,
  loading = false,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
  onClearAll,
  onNavigate,
}) {
  const isAr = lang === 'ar';

  useEffect(() => {
    onRefresh?.();
  }, [user?.id]);

  const handleOpenItem = useCallback(async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, user?.role);
    if (!item.read_at) {
      await onMarkRead(item.id);
    }
    onNavigate(dest);
  }, [lang, onMarkRead, onNavigate, t, user?.role]);

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-fade-in">
      <div className="card p-6 sm:p-8 mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
            <Inbox className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black">
              {t.siteInboxTitle || (isAr ? 'بريد الموقع' : 'Site inbox')}
            </h1>
            <p className="text-sm text-[var(--text-sec)] mt-1">
              {t.siteInboxDesc || (isAr
                ? 'كل تحديثات حسابك هنا — مشتريات، شحن، وأكواد الاسترداد. لا بريد خارجي.'
                : 'All account updates live here — purchases, recharges, and redeem codes. No external email.')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-5">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={onMarkAllRead}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              {t.markAllRead}
            </button>
          )}
          {notifications.length > 0 && (
            <button
              type="button"
              onClick={onClearAll}
              className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t.clearNotifications}
            </button>
          )}
        </div>
      </div>

      {loading && notifications.length === 0 ? (
        <div className="card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto" />
        </div>
      ) : notifications.length === 0 ? (
        <div className="card p-12 text-center text-[var(--text-sec)]">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-35" strokeWidth={1.5} />
          <p>{t.noNotifications}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((item) => {
            const formatted = formatNotification(item, t, lang);
            const unread = !item.read_at;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleOpenItem(item)}
                className={`card w-full text-left p-4 sm:p-5 transition-colors hover:border-[var(--accent)]/35 border ${
                  toneClasses[formatted.tone] || toneClasses.info
                } ${unread ? 'ring-1 ring-[var(--accent)]/20' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-[var(--text-primary)]">
                      {formatted.title}
                    </div>
                    <div className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
                      {formatted.body}
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mt-2">
                      {relativeTime(item.created_at, lang)}
                    </div>
                  </div>
                  {unread && (
                    <span className="header-notif-dot flex-shrink-0 mt-1" aria-hidden="true" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-center text-[var(--text-muted)] mt-6 pb-4">
        {t.siteInboxRetention || (isAr
          ? 'تُحذف الإشعارات المقروءة بعد 14 يوماً. الحد الأقصى 40 إشعاراً.'
          : 'Read notifications are removed after 14 days. Max 40 kept.')}
      </p>
    </div>
  );
}