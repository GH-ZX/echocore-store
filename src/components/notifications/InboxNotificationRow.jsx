import { X } from 'lucide-react';
import { formatNotificationRelativeTime } from '../../lib/notificationTime';

const toneClasses = {
  warning: 'border-amber-500/30 bg-amber-500/8',
  success: 'border-emerald-500/30 bg-emerald-500/8',
  danger: 'border-red-500/30 bg-red-500/8',
  info: 'border-sky-500/25 bg-sky-500/6',
};

const compactToneClasses = {
  warning: 'border-amber-500/25 bg-amber-500/8',
  success: 'border-emerald-500/25 bg-emerald-500/8',
  danger: 'border-red-500/25 bg-red-500/8',
  info: 'border-sky-500/20 bg-sky-500/6',
};

export default function InboxNotificationRow({
  item,
  formatted,
  t = {},
  variant = 'page',
  onOpen,
  onDismiss,
  dismissing = false,
}) {
  const unread = !item.read_at;
  const tones = variant === 'dropdown' ? compactToneClasses : toneClasses;
  const toneClass = tones[formatted.tone] || tones.info;

  if (variant === 'dropdown') {
    return (
      <div
        className={`header-notif-item group ${unread ? 'header-notif-item--unread' : ''} ${toneClass}`}
      >
        <button
          type="button"
          role="menuitem"
          onClick={() => onOpen?.(item)}
          className="w-full text-left min-w-0"
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
            {formatNotificationRelativeTime(item.created_at, t)}
          </div>
        </button>
        {onDismiss && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onDismiss(item);
            }}
            disabled={dismissing}
            className="inbox-dismiss-btn inbox-dismiss-btn--compact"
            aria-label={t.inboxDismissAria}
            title={t.inboxDismiss}
          >
            <X className="w-3 h-3" strokeWidth={2.5} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className={`card inbox-notification-row border transition-colors hover:border-[var(--accent)]/35 ${toneClass} ${
        unread ? 'ring-1 ring-[var(--accent)]/20' : ''
      }`}
    >
      <button
        type="button"
        onClick={() => onOpen?.(item)}
        className="inbox-notification-main w-full text-left p-4 sm:p-5 min-w-0"
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
              {formatNotificationRelativeTime(item.created_at, t)}
            </div>
          </div>
          {unread && (
            <span className="header-notif-dot flex-shrink-0 mt-1" aria-hidden="true" />
          )}
        </div>
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(item)}
          disabled={dismissing}
          className="inbox-dismiss-btn"
          aria-label={t.inboxDismissAria}
          title={t.inboxDismiss}
        >
          <X className="w-4 h-4" strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}