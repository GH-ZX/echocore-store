import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Megaphone, RefreshCw } from 'lucide-react';
import { Spinner } from '../routing/PageLoader';
import InboxNotificationRow from '../notifications/InboxNotificationRow';
import InboxPager from '../notifications/InboxPager';
import InboxSearchBar from '../notifications/InboxSearchBar';
import {
  fetchAdminAnnouncements,
  formatNotification,
  getNotificationDestination,
} from '../../lib/notifications';
import { paginateInboxItems, searchInboxNotifications } from '../../lib/inboxList';
import { formatMessage } from '../../lib/i18n';
import { getAdminDashboardPath, navigateTo } from '../../lib/adminRoutes';

const PAGE_SIZE = 25;

export default function AdminAnnouncementsManager({
  t = {},
  lang = 'ar',
  onMarkRead,
}) {
  const navigate = useNavigate();
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);

  const loadAnnouncements = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchAdminAnnouncements(500);
      setAnnouncements(items);
    } catch (err) {
      console.error('Failed to load admin announcements:', err);
      setAnnouncements([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery]);

  const searched = useMemo(
    () => searchInboxNotifications(announcements, searchQuery, t, lang),
    [announcements, searchQuery, t, lang],
  );

  const pagination = useMemo(
    () => paginateInboxItems(searched, page, PAGE_SIZE),
    [searched, page],
  );

  const handleOpenItem = useCallback(async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, 'admin');
    navigateTo(navigate, dest || getAdminDashboardPath('inbox'));
    if (!item.read_at) {
      try {
        await onMarkRead?.(item.id);
      } catch {
        /* non-blocking */
      }
    }
  }, [lang, navigate, onMarkRead, t]);

  const textDir = lang === 'ar' ? 'rtl' : 'ltr';

  return (
    <div className="space-y-4" dir={textDir}>
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)] flex-shrink-0">
              <Megaphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-lg font-black">{t.adminAnnouncementsTab}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">{t.adminAnnouncementsDesc}</p>
              {announcements.length > 0 && (
                <p className="text-xs text-[var(--text-muted)] mt-2">
                  {formatMessage(t.adminAnnouncementsCount, { count: announcements.length })}
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/announcements"
              target="_blank"
              rel="noopener noreferrer"
              className="action-chip gap-1.5 text-xs"
              title={t.adminAnnouncementsPreviewHint}
            >
              <Eye className="w-3.5 h-3.5" />
              {t.adminAnnouncementsPreview}
            </a>
            <button type="button" onClick={loadAnnouncements} className="action-chip gap-1.5 text-xs">
              <RefreshCw className="w-3.5 h-3.5" />
              {t.refresh}
            </button>
          </div>
        </div>

        <InboxSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          t={t}
          id="admin-announcements-search"
        />
      </div>

      {loading && announcements.length === 0 ? (
        <div className="card p-10 text-center">
          <Spinner size="w-7" className="mx-auto text-[var(--accent)]" />
        </div>
      ) : announcements.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          <Megaphone className="w-9 h-9 mx-auto mb-3 opacity-35" strokeWidth={1.5} />
          <p>{t.inboxEmptyAnnouncements}</p>
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
