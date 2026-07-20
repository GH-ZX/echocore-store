import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ExternalLink, FileText, Loader2, RefreshCw, ShoppingCart, Wallet } from 'lucide-react';
import InboxNotificationRow from '../notifications/InboxNotificationRow';
import InboxPager from '../notifications/InboxPager';
import InboxSearchBar from '../notifications/InboxSearchBar';
import {
  formatNotification,
  getNotificationDestination,
} from '../../lib/notifications';
import {
  INBOX_FILTER_IDS,
  countInboxFilterMatches,
  filterInboxNotifications,
  getAdminInboxFilterOptions,
  getInboxEmptyMessageKey,
} from '../../lib/inboxFilters';
import { getInvoiceRouteFromNotification } from '../../lib/invoiceBuilder';
import { paginateInboxItems, searchInboxNotifications } from '../../lib/inboxList';
import { formatMessage } from '../../lib/i18n';
import { getAdminDashboardPath, navigateTo } from '../../lib/adminRoutes';

/** Align with orders / recharges / users list density */
const ADMIN_INBOX_PAGE_SIZE = 25;

export default function AdminInboxManager({
  t = {},
  lang = 'ar',
  notifications = [],
  unreadCount = 0,
  loading = false,
  onRefresh,
  onMarkRead,
  onMarkAllRead,
}) {
  const navigate = useNavigate();
  // Alerts-first: open on unread so this page is not a second “orders” list
  const [activeFilter, setActiveFilter] = useState(INBOX_FILTER_IDS.UNREAD);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    onRefresh?.();
  }, [onRefresh]);

  useEffect(() => {
    setPage(1);
  }, [activeFilter, searchQuery]);

  const filterOptions = useMemo(() => getAdminInboxFilterOptions(t), [t]);

  const filteredNotifications = useMemo(
    () => filterInboxNotifications(notifications, activeFilter),
    [notifications, activeFilter],
  );

  const searchedNotifications = useMemo(
    () => searchInboxNotifications(filteredNotifications, searchQuery, t, lang),
    [filteredNotifications, searchQuery, t, lang],
  );

  const pagination = useMemo(
    () => paginateInboxItems(searchedNotifications, page, ADMIN_INBOX_PAGE_SIZE),
    [searchedNotifications, page],
  );

  const activityUnread = useMemo(
    () => countInboxFilterMatches(
      notifications.filter((item) => !item.read_at),
      INBOX_FILTER_IDS.ACTIVITY,
    ),
    [notifications],
  );

  const handleOpenItem = useCallback(async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, 'admin');
    // Navigate first so mark-read failures never block opening Contact messages
    navigateTo(navigate, dest || getAdminDashboardPath('inbox'));
    if (!item.read_at) {
      try {
        await onMarkRead?.(item.id);
      } catch {
        /* non-blocking */
      }
    }
  }, [lang, navigate, onMarkRead, t]);

  const handleOpenInvoice = useCallback(async (item, event) => {
    event?.stopPropagation?.();
    const path = getInvoiceRouteFromNotification(item);
    if (!path) return;
    if (!item.read_at) {
      await onMarkRead?.(item.id);
    }
    navigate(path);
  }, [navigate, onMarkRead]);

  const emptyMessageKey = getInboxEmptyMessageKey(activeFilter);
  const textDir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="space-y-4" dir={textDir}>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black">{t.adminInboxTitle}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">{t.adminInboxDesc}</p>
              {notifications.length > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {formatMessage(t.inboxShowingCount, {
                    shown: pagination.total,
                    total: notifications.length,
                  })}
                  {activityUnread > 0 && (
                    <>
                      {' · '}
                      {formatMessage(t.adminInboxUnreadActivity, { count: activityUnread })}
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(getAdminDashboardPath('orders'))}
              className="action-chip gap-1.5 text-xs"
              title={t.adminInboxOpenOrdersHint}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
              {formatMessage(t.adminInboxOpenQueue, { queue: t.ordersTab })}
            </button>
            <button
              type="button"
              onClick={() => navigate(getAdminDashboardPath('recharges'))}
              className="action-chip gap-1.5 text-xs"
              title={t.adminInboxOpenRechargesHint}
            >
              <Wallet className="w-3.5 h-3.5" />
              {formatMessage(t.adminInboxOpenQueue, { queue: t.rechargesTab })}
            </button>
            <button type="button" onClick={onRefresh} className="action-chip gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              {t.refresh}
            </button>
            {unreadCount > 0 && (
              <button type="button" onClick={onMarkAllRead} className="btn btn-secondary text-xs py-2 px-3">
                {t.markAllRead}
              </button>
            )}
          </div>
        </div>

        <InboxSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          t={t}
          id="admin-inbox-search"
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
                {count > 0 && <span className="inbox-filter-chip-count">{count}</span>}
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
        <div className="card p-10 text-center text-[var(--text-sec)] space-y-3">
          <Bell className="w-9 h-9 mx-auto mb-1 opacity-35" />
          <p>{searchQuery.trim() ? t.inboxSearchEmpty : (t[emptyMessageKey] || t.noNotifications)}</p>
          {!searchQuery.trim() && activeFilter === INBOX_FILTER_IDS.UNREAD ? (
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setActiveFilter(INBOX_FILTER_IDS.ACTIVITY)}
                className="btn btn-secondary text-xs py-2 px-3"
              >
                {t.adminInboxShowActivity}
              </button>
              <button
                type="button"
                onClick={() => navigate(getAdminDashboardPath('orders'))}
                className="action-chip gap-1.5 text-xs"
              >
                <ShoppingCart className="w-3.5 h-3.5" />
                {t.ordersTab}
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {pagination.items.map((item) => {
              const formatted = formatNotification(item, t, lang);
              const invoicePath = getInvoiceRouteFromNotification(item);
              const dest = getNotificationDestination(item, formatted, 'admin');
              const destPath = String(dest?.path || dest?.pathname || '');
              const queueLabel = destPath.includes('/orders')
                ? t.ordersTab
                : destPath.includes('/recharges')
                  ? t.rechargesTab
                  : destPath.includes('/contact') || item.type === 'admin_contact_message'
                    ? (t.adminContactTab || t.tabContactShort)
                    : null;

              const footerActions = (invoicePath || queueLabel) ? (
                <>
                  {invoicePath ? (
                    <button
                      type="button"
                      onClick={(event) => handleOpenInvoice(item, event)}
                      className="action-chip gap-1.5 text-xs"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {t.viewInvoice}
                    </button>
                  ) : null}
                  {queueLabel ? (
                    <button
                      type="button"
                      onClick={() => handleOpenItem(item)}
                      className="action-chip gap-1.5 text-xs"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      {formatMessage(t.adminInboxOpenQueue, { queue: queueLabel })}
                    </button>
                  ) : null}
                </>
              ) : null;

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
                  footerActions={footerActions}
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