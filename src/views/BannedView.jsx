import { ShieldBan, Mail } from 'lucide-react';
import { formatMessage } from '../lib/i18n';
import { isBanPermanent } from '../lib/userBan';

export default function BannedView({
  t = {},
  lang = 'ar',
  user,
  onContactSupport,
}) {
  const permanent = isBanPermanent(user);
  const expiresLabel = user?.banExpiresAt
    ? new Date(user.banExpiresAt).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
    : '';

  return (
    <div className="max-w-lg mx-auto px-2 sm:px-0 animate-fade-in">
      <div className="card p-8 sm:p-10 text-center">
        <div className="w-16 h-16 rounded-2xl bg-red-500/15 flex items-center justify-center text-red-400 mx-auto mb-5">
          <ShieldBan className="w-8 h-8" strokeWidth={2} />
        </div>
        <h1 className="text-2xl font-black mb-2">{t.bannedPageTitle}</h1>
        <p className="text-sm text-[var(--text-sec)] leading-relaxed">
          {t.bannedPageDesc}
        </p>

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

        <button
          type="button"
          onClick={onContactSupport}
          className="btn btn-primary w-full mt-6 inline-flex items-center justify-center gap-2"
        >
          <Mail className="w-4 h-4" strokeWidth={2} />
          {t.bannedContactSupport}
        </button>
      </div>
    </div>
  );
}