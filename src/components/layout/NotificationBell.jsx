import { useRef, useEffect } from 'react';
import { Bell, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  formatNotification,
  getNotificationDestination,
} from '../../lib/notifications';

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
  warning: 'border-amber-500/25 bg-amber-500/8',
  success: 'border-emerald-500/25 bg-emerald-500/8',
  danger: 'border-red-500/25 bg-red-500/8',
  info: 'border-sky-500/20 bg-sky-500/6',
};

export default function NotificationBell({
  t = {},
  lang = 'ar',
  user,
  notifications = [],
  unreadCount = 0,
  loading = false,
  open = false,
  onToggle = () => {},
  onClose = () => {},
  onMarkRead = () => {},
  onMarkAllRead = () => {},
  onClearAll = () => {},
  onNavigate = () => {},
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (ref.current && !ref.current.contains(event.target)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [open, onClose]);

  const handleOpenItem = async (item) => {
    const formatted = formatNotification(item, t, lang);
    const dest = getNotificationDestination(item, formatted, user?.role);
    if (!item.read_at) {
      await onMarkRead(item.id);
    }
    onClose();
    onNavigate(dest);
  };

  const handleClearAll = async (event) => {
    event.stopPropagation();
    await onClearAll();
  };

  const handleMarkAllRead = async (event) => {
    event.stopPropagation();
    await onMarkAllRead();
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={onToggle}
        className={`header-btn header-btn-icon relative ${open ? 'header-btn--accent' : ''}`}
        aria-label={t.notifications || 'Notifications'}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Bell strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="header-notif-badge" aria-hidden="true">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="notif-dropdown"
            role="menu"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.96 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="header-notif-dropdown"
          >
            <div className="header-notif-head">
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  {t.notifications || (lang === 'ar' ? 'الإشعارات' : 'Notifications')}
                </div>
                {unreadCount > 0 && (
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {applyUnreadLabel(t, lang, unreadCount)}
                  </div>
                )}
              </div>
              <div className="header-notif-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="header-notif-action-btn"
                    title={t.markAllRead || (lang === 'ar' ? 'تعليم الكل كمقروء' : 'Mark all read')}
                  >
                    <CheckCheck className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="header-notif-action-btn header-notif-action-btn--danger"
                    title={t.clearNotifications || (lang === 'ar' ? 'مسح الإشعارات' : 'Clear all')}
                  >
                    <Trash2 className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                )}
              </div>
            </div>

            <div className="header-notif-list">
              {loading ? (
                <div className="header-notif-empty">
                  <Loader2 className="w-5 h-5 animate-spin text-[var(--accent)] mx-auto" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="header-notif-empty">
                  <Bell className="w-6 h-6 mx-auto mb-2 opacity-40" strokeWidth={1.5} />
                  <div className="text-xs text-[var(--text-muted)]">
                    {t.noNotifications || (lang === 'ar' ? 'لا توجد إشعارات بعد' : 'No notifications yet')}
                  </div>
                </div>
              ) : (
                notifications.map((item) => {
                  const formatted = formatNotification(item, t, lang);
                  const unread = !item.read_at;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleOpenItem(item)}
                      className={`header-notif-item ${unread ? 'header-notif-item--unread' : ''} ${toneClasses[formatted.tone] || toneClasses.info}`}
                    >
                      <div className="flex items-start justify-between gap-2 w-full">
                        <div className="min-w-0 text-left">
                          <div className="text-xs font-bold text-[var(--text-primary)] leading-snug">
                            {formatted.title}
                          </div>
                          <div className="text-[11px] text-[var(--text-sec)] mt-0.5 leading-snug line-clamp-3">
                            {formatted.body}
                          </div>
                        </div>
                        {unread && <span className="header-notif-dot flex-shrink-0" aria-hidden="true" />}
                      </div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1.5 text-left">
                        {relativeTime(item.created_at, lang)}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function applyUnreadLabel(t, lang, count) {
  const template = t.unreadNotifications || (lang === 'ar' ? '{count} غير مقروء' : '{count} unread');
  return template.replace('{count}', String(count));
}