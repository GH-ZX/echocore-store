import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, Loader2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ConfirmDialog from '../ui/ConfirmDialog';
import InboxNotificationRow from '../notifications/InboxNotificationRow';
import {
  formatNotification,
  getNotificationDestination,
} from '../../lib/notifications';
import { formatMessage } from '../../lib/i18n';
import { useHeaderDropdownPosition } from '../../hooks/useHeaderDropdownPosition';

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
  onDismiss = () => {},
  onNavigate = () => {},
  onViewAllInbox = () => {},
}) {
  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [dismissingId, setDismissingId] = useState(null);
  const { coords, updatePosition } = useHeaderDropdownPosition(triggerRef, open, {
    align: 'end',
    gap: 8,
    width: 352,
  });

  useEffect(() => {
    if (!open) return undefined;

    const handlePointerDown = (event) => {
      if (
        triggerRef.current?.contains(event.target)
        || panelRef.current?.contains(event.target)
      ) return;
      onClose();
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

  const handleClearAll = (event) => {
    event.stopPropagation();
    setConfirmClearOpen(true);
  };

  const handleConfirmClear = useCallback(async () => {
    setClearing(true);
    try {
      await onClearAll();
      setConfirmClearOpen(false);
    } finally {
      setClearing(false);
    }
  }, [onClearAll]);

  const handleMarkAllRead = async (event) => {
    event.stopPropagation();
    await onMarkAllRead();
  };

  const handleDismiss = useCallback(async (item) => {
    if (!item?.id || dismissingId) return;
    setDismissingId(item.id);
    try {
      await onDismiss(item.id);
    } finally {
      setDismissingId(null);
    }
  }, [dismissingId, onDismiss]);

  const dropdownPanel = typeof document !== 'undefined'
    ? createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            key="notif-dropdown"
            role="menu"
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="header-notif-dropdown header-glass-dropdown glass-surface"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
            }}
          >
            <div className="header-notif-head">
              <div>
                <div className="text-sm font-bold text-[var(--text-primary)]">
                  {t.notifications}
                </div>
                {unreadCount > 0 && (
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {formatMessage(t.unreadNotifications, { count: unreadCount })}
                  </div>
                )}
              </div>
              <div className="header-notif-actions">
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="header-notif-action-btn"
                    title={t.markAllRead}
                  >
                    <CheckCheck className="w-3.5 h-3.5" strokeWidth={2} />
                  </button>
                )}
                {notifications.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="header-notif-action-btn header-notif-action-btn--danger"
                    title={t.clearNotifications}
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
                    {t.noNotifications}
                  </div>
                </div>
              ) : (
                notifications.map((item) => {
                  const formatted = formatNotification(item, t, lang);
                  return (
                    <InboxNotificationRow
                      key={item.id}
                      item={item}
                      formatted={formatted}
                      t={t}
                      variant="dropdown"
                      onOpen={handleOpenItem}
                      onDismiss={handleDismiss}
                      dismissing={dismissingId === item.id}
                    />
                  );
                })
              )}
            </div>

            <div className="header-notif-foot">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewAllInbox();
                }}
                className="header-notif-view-all"
              >
                {t.viewAllNotifications}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
      document.body,
    )
    : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          updatePosition();
          onToggle();
        }}
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
      {dropdownPanel}
      <ConfirmDialog
        open={confirmClearOpen}
        title={t.inboxClearConfirmTitle}
        message={t.inboxClearConfirmMessage}
        confirmLabel={t.clearNotifications}
        cancelLabel={t.cancel}
        loading={clearing}
        onConfirm={handleConfirmClear}
        onCancel={() => !clearing && setConfirmClearOpen(false)}
      />
    </div>
  );
}