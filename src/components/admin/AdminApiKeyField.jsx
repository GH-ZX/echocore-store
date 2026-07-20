import { KeyRound, Link2, Loader2, Lock, Trash2 } from 'lucide-react';

/**
 * Shared API-key editor — same pattern as Sam API:
 * unlocked = paste + connect/test; locked = masked + delete.
 */
export default function AdminApiKeyField({
  t = {},
  title,
  description,
  locked = false,
  maskedValue = '',
  value = '',
  onChange,
  placeholder = '',
  onConnect,
  connectLabel,
  connectDisabled = false,
  connecting = false,
  onDelete,
  deleteLabel,
  hint = '',
  mono = true,
  id = 'admin-api-key',
}) {
  return (
    <div className={`admin-api-key-card${locked ? ' admin-api-key-card--locked' : ''}`}>
      <div className="admin-api-key-card__head">
        <span className="admin-api-key-card__icon" aria-hidden>
          <KeyRound className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="admin-api-key-card__title">{title}</h4>
          {description ? (
            <p className="admin-api-key-card__desc">{description}</p>
          ) : null}
        </div>
        {locked && (
          <span className="admin-api-key-card__lock-badge">
            <Lock className="w-3 h-3" aria-hidden />
            {t.samApiLockedBadge || t.igdbConfigured}
          </span>
        )}
      </div>

      {locked && (
        <div className="admin-api-key-card__locked-note">
          <Lock className="w-4 h-4 shrink-0 text-[var(--accent)]" aria-hidden />
          <span>{t.samApiSettingsLocked || t.apiKeyLockedHint}</span>
        </div>
      )}

      <input
        id={id}
        type="password"
        value={locked ? (maskedValue || '••••••••') : value}
        onChange={(e) => !locked && onChange?.(e.target.value)}
        placeholder={locked ? '' : placeholder}
        readOnly={locked}
        disabled={locked}
        autoComplete="off"
        dir="ltr"
        className={`admin-api-key-card__input${mono ? ' font-mono' : ''}`}
      />

      {hint && !locked ? (
        <p className="admin-api-key-card__hint">{hint}</p>
      ) : null}

      <div className="admin-api-key-card__actions">
        {locked ? (
          onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="action-chip border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1.5"
            >
              <Trash2 className="w-4 h-4" />
              {deleteLabel || t.samApiDeleteKey || t.apiKeyDelete}
            </button>
          ) : null
        ) : (
          onConnect ? (
            <button
              type="button"
              onClick={onConnect}
              disabled={connectDisabled || connecting}
              className="action-chip border-green-500/30 text-green-400 hover:bg-green-500/10 disabled:opacity-50 gap-1.5"
            >
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
              {connectLabel || t.testConnection}
            </button>
          ) : null
        )}
      </div>
    </div>
  );
}
