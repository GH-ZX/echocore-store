import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, Inbox, Loader2 } from 'lucide-react';
import InboxNotificationRow from '../components/notifications/InboxNotificationRow';
import InboxPager from '../components/notifications/InboxPager';
import InboxSearchBar from '../components/notifications/InboxSearchBar';
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
import { paginateInboxItems, searchInboxNotifications } from '../lib/inboxList';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const markedReadOnEnterRef = useRef(false);

  useEffect(() => {
    onRefresh?.();
  }, [user?.id, onRefresh]);

  useEffect(() => {
    if (markedReadOnEnterRef.current || unreadCount <= 0) return;
    markedReadOnEnterRef.current = true;
    onMarkAllRead?.();
  }, [unreadCount, onMarkAllRead]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchQuery]);

  const filterOptions = useMemo(
    () => getInboxFilterOptions(t, user?.role),
    [t, user?.role],
  );

  const filteredNotifications = useMemo(
    () => filterInboxNotifications(notifications, activeFilter),
    [notifications, activeFilter],
  );

  const searchedNotifications = useMemo(
    () => searchInboxNotifications(filteredNotifications, searchQuery, t, lang),
    [filteredNotifications, searchQuery, t, lang],
  );

  const pagination = useMemo(
    () => paginateInboxItems(searchedNotifications, page),
    [searchedNotifications, page],
  );

  const handleOpenItem = useCallback(async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, user?.role);
    // Navigate first so mark-read never blocks opening Contact / order pages
    onNavigate?.(dest);
    if (!item.read_at) {
      try {
        await onMarkRead?.(item.id);
      } catch {
        /* non-blocking */
      }
    }
  }, [lang, onMarkRead, onNavigate, t, user?.role]);

  const emptyMessageKey = getInboxEmptyMessageKey(activeFilter);
  const textDir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-fade-in" dir={textDir}>
      <div className="card p-5 sm:p-6 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
            <Inbox className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black">{t.siteInboxTitle}</h1>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.siteInboxDesc}</p>
            {notifications.length > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {formatMessage(t.inboxShowingCount, {
                  shown: pagination.total,
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

        <InboxSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          t={t}
          id="site-inbox-search"
        />

        <div className="inbox-filter-bar mt-4" role="tablist" aria-label={t.inboxFilterLabel}>
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
        <div className="card p-10 text-center">
          <Loader2 className="w-7 h-7 animate-spin text-[var(--accent)] mx-auto" />
        </div>
      ) : pagination.total === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          <Bell className="w-9 h-9 mx-auto mb-3 opacity-35" strokeWidth={1.5} />
          <p>{searchQuery.trim() ? t.inboxSearchEmpty : (t[emptyMessageKey] || t.noNotifications)}</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagination.items.map((item) => {
              const formatted = formatNotification(item, t, lang);
              return (
                <InboxNotificationRow
                  key={item.id}
                  item={item}
                  formatted={formatted}
                  t={t}
                  lang={lang}
                  variant="page"
                  compact
                  onOpen={handleOpenItem}
                />
              );
            })}
          </div>
          <InboxPager
            page={pagination.page}
            totalPages={pagination.totalPages}
            total={pagination.total}
            onPageChange={setPage}
            t={t}
            lang={lang}
          />
        </>
      )}
    </div>
  );
}