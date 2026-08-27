import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Megaphone } from 'lucide-react';
import { Spinner } from '../components/routing/PageLoader';
import InboxNotificationRow from '../components/notifications/InboxNotificationRow';
import {
  formatNotification,
  getNotificationDestination,
} from '../lib/notifications';
import { formatMessage } from '../lib/i18n';

const BROADCAST_TYPES = new Set([
  'admin_announcement',
  'admin_warning',
  'admin_maintenance_notice',
]);


export default function AnnouncementsView({
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
  const [searchParams] = useSearchParams();
  const highlightId = searchParams.get('id');
  const markedReadOnEnterRef = useRef(false);
  const highlightRef = useRef(null);

  useEffect(() => {
    onRefresh?.();
  }, [user?.id, onRefresh]);

  useEffect(() => {
    if (markedReadOnEnterRef.current || unreadCount <= 0) return;
    markedReadOnEnterRef.current = true;
    onMarkAllRead?.();
  }, [unreadCount, onMarkAllRead]);

  const announcements = useMemo(
    () => notifications.filter((item) => BROADCAST_TYPES.has(item?.type)),
    [notifications],
  );

  // Auto-scroll to highlighted announcement
  useEffect(() => {
    if (highlightId && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightId, announcements.length]);

  const handleOpenItem = useCallback(async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, user?.role);
    onNavigate?.(dest);
    if (!item.read_at) {
      try {
        await onMarkRead?.(item.id);
      } catch {
        /* non-blocking */
      }
    }
  }, [lang, onMarkRead, onNavigate, t, user?.role]);

  const textDir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="max-w-2xl mx-auto px-2 sm:px-0 animate-fade-in" dir={textDir}>
      <div className="card p-5 sm:p-6 mb-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
            <Megaphone className="w-5 h-5" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-black">{t.announcementsPageTitle}</h1>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.announcementsPageDesc}</p>
            {announcements.length > 0 && (
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {formatMessage(t.announcementsPageCount, { count: announcements.length })}
              </p>
            )}
          </div>
        </div>
      </div>

      {loading && announcements.length === 0 ? (
        <div className="card p-10 text-center">
          <Spinner size="w-7" className="mx-auto text-[var(--accent)]" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          <Bell className="w-9 h-9 mx-auto mb-3 opacity-35" strokeWidth={1.5} />
          <p>{t.announcementsPageEmpty}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {announcements.map((item) => {
            const formatted = formatNotification(item, t, lang);
            const isHighlighted = highlightId && String(item.id) === String(highlightId);
            return (
              <div
                key={item.id}
                ref={isHighlighted ? highlightRef : undefined}
                className={isHighlighted ? 'ring-2 ring-[var(--accent)]/50 rounded-xl' : ''}
              >
                <InboxNotificationRow
                  item={item}
                  formatted={formatted}
                  t={t}
                  lang={lang}
                  variant="page"
                  compact
                  onOpen={handleOpenItem}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
