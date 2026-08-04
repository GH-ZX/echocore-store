import { ShieldBan, Mail } from 'lucide-react';
import { formatDateTime, formatMessage } from '../lib/i18n';
import { isBanPermanent } from '../lib/userBan';
import EmptyState from '../components/ui/EmptyState';

export default function BannedView({
  t = {},
  lang = 'ar',
  user,
  onContactSupport,
}) {
  const permanent = isBanPermanent(user);
  const expiresLabel = user?.banExpiresAt
    ? formatDateTime(user.banExpiresAt, lang, { dateStyle: 'medium', timeStyle: 'short' })
    : '';

  return (
    <div className="max-w-lg mx-auto px-2 sm:px-0 animate-fade-in">
      <EmptyState
        icon={ShieldBan}
        iconClass="text-red-400"
        className="sm:p-10"
        title={t.bannedPageTitle}
        description={t.bannedPageDesc}
        action={
          <button
            type="button"
            onClick={onContactSupport}
            className="btn btn-primary w-full mt-6 inline-flex items-center justify-center gap-2"
          >
            <Mail className="w-4 h-4" strokeWidth={2} />
            {t.bannedContactSupport}
          </button>
        }
      >
        <div className="mt-6 p-4 rounded-xl border border-red-500/25 bg-red-500/8 text-left">
          <div className="text-xs font-bold uppercase tracking-wide text-red-300 mb-2">
            {permanent ? t.bannedPermanentLabel : t.bannedTemporaryLabel}
          </div>
          {user?.banReason && (
            <p className="text-sm text-[var(--text-primary)] leading-relaxed">
              {user.banReason}
            </p>
          )}
          {!permanent && expiresLabel && (
            <p className="text-xs text-[var(--text-muted)] mt-2">
              {formatMessage(t.bannedExpiresAt, { date: expiresLabel })}
            </p>
          )}
        </div>
      </EmptyState>
    </div>
  );
}
