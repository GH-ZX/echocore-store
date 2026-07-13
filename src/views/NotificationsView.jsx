import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Inbox, Loader2 } from 'lucide-react';
import InboxNotificationRow from '../components/notifications/InboxNotificationRow';
import {
  formatNotification,
  getNotificationDestination,
} from '../lib/notifications';
import {
  INBOX_FILTER_IDS,
  countInboxFilterMatches,
  filterInboxNotifications,
  getInboxEmptyMessageKey,
  getInboxFilterOptions,
} from '../lib/inboxFilters';
import { formatMessage } from '../lib/i18n';

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
  onNavigate,
}) {
  const [activeFilter, setActiveFilter] = useState(INBOX_FILTER_IDS.ALL);
  const markedReadOnEnterRef = useRef(false);

  useEffect(() => {
    onRefresh?.();
  }, [user?.id, onRefresh]);

  useEffect(() => {
    if (markedReadOnEnterRef.current || unreadCount <= 0) return;
    markedReadOnEnterRef.current = true;
    onMarkAllRead?.();
  }, [unreadCount, onMarkAllRead]);

  const filterOptions = useMemo(
    () => getInboxFilterOptions(t, user?.role),
    [t, user?.role],
  );

  const filteredNotifications = useMemo(
    () => filterInboxNotifications(notifications, activeFilter),
    [notifications, activeFilter],
  );

  const handleOpenItem = useCallback(async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, user?.role);
    if (!item.read_at) {
      await onMarkRead?.(item.id);
    }
    onNavigate?.(dest);
  }, [lang, onMarkRead, onNavigate, t, user?.role]);

  const emptyMessageKey = getInboxEmptyMessageKey(activeFilter);

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-fade-in">
      <div className="card p-6 sm:p-8 mb-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
            <Inbox className="w-6 h-6" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-black">
              {t.siteInboxTitle}
            </h1>
            <p className="text-sm text-[var(--text-sec)] mt-1">
              {t.siteInboxDesc}
            </p>
            {notifications.length > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {formatMessage(t.inboxShowingCount, {
                  shown: filteredNotifications.length,
                  total: notifications.length,
                })}
                {unreadCount > 0 && (
                  <>
                    {' · '}
                    {formatMessage(t.unreadNotifications, { count: unreadCount })}
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="inbox-filter-bar mt-5" role="tablist" aria-label={t.inboxFilterLabel}>
          {filterOptions.map((option) => {
            const count = countInboxFilterMatches(notifications, option.id);
            const active = activeFilter === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveFilter(option.id)}
                className={`inbox-filter-chip ${active ? 'inbox-filter-chip--active' : ''}`}
              >
                <span>{option.label}</span>
                {count > 0 && (
                  <span className="inbox-filter-chip-count">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {loading && notifications.length === 0 ? (
        <div className="card p-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto" />
        </div>
      ) : filteredNotifications.length === 0 ? (
        <div className="card p-12 text-center text-[var(--text-sec)]">
          <Bell className="w-10 h-10 mx-auto mb-3 opacity-35" strokeWidth={1.5} />
          <p>{t[emptyMessageKey] || t.noNotifications}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotifications.map((item) => {
            const formatted = formatNotification(item, t, lang);
            return (
              <InboxNotificationRow
                key={item.id}
                item={item}
                formatted={formatted}
                t={t}
                variant="page"
                onOpen={handleOpenItem}
              />
            );
          })}
        </div>
      )}

      <p className="text-xs text-center text-[var(--text-muted)] mt-6 pb-4">
        {t.siteInboxRetention}
      </p>
    </div>
  );
}