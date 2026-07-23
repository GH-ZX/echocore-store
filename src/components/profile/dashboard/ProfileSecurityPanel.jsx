import { useState } from 'react';
import { Lock, Loader2, Mail } from 'lucide-react';
import {
  authUserHasEmailPassword,
  setOrUpdateAccountPassword,
  validatePasswordLength,
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
} from '../../../lib/auth';

export default function ProfileSecurityPanel({
  t = {},
  user,
  hasPasswordLogin = false,
  onPasswordStateChange,
}) {
  const [passwordDraft, setPasswordDraft] = useState('');
  const [passwordConfirmDraft, setPasswordConfirmDraft] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState('');
  const [hasPw, setHasPw] = useState(!!hasPasswordLogin);

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    setPasswordSuccess('');

    const lengthCheck = validatePasswordLength(passwordDraft);
    if (!lengthCheck.valid) {
      setPasswordError(
        lengthCheck.code === 'too_long' ? t.passwordMaxLength : t.passwordLengthRange,
      );
      return;
    }
    if (passwordDraft !== passwordConfirmDraft) {
      setPasswordError(t.passwordMismatch);
      return;
    }

    setSavingPassword(true);
    try {
      const wasExisting = hasPw;
      const authUser = await setOrUpdateAccountPassword(passwordDraft);
      const next = authUserHasEmailPassword(authUser) || true;
      setHasPw(next);
      onPasswordStateChange?.(next);
      setPasswordDraft('');
      setPasswordConfirmDraft('');
      setPasswordSuccess(
        wasExisting ? t.passwordUpdatedSuccess : t.passwordSetSuccess,
      );
    } catch (err) {
      const code = err?.code || '';
      if (code === 'too_long') setPasswordError(t.passwordMaxLength);
      else if (code === 'too_short') setPasswordError(t.passwordLengthRange);
      else setPasswordError(err.message || t.passwordSaveFailed);
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-5 max-w-md">
      <div className="rounded-xl border border-[var(--border)] p-4 space-y-2">
        <h3 className="text-sm font-bold flex items-center gap-2">
          <Mail className="w-4 h-4 text-[var(--accent)]" />
          {t.dashSecurityAccount}
        </h3>
        <p className="text-sm text-[var(--text-sec)] break-all" dir="ltr">
          {user?.email || '—'}
        </p>
        <p className="text-xs text-[var(--text-muted)]">
          {hasPw ? t.dashSecurityHasPassword : t.dashSecurityGoogleOnly}
        </p>
      </div>

      <div>
        <h3 className="font-bold text-base flex items-center gap-2 mb-1">
          <Lock className="w-5 h-5 text-[var(--accent)]" />
          {hasPw ? t.changePasswordTitle : t.setPasswordTitle}
        </h3>
        <p className="text-xs text-[var(--text-muted)] mb-4 leading-relaxed">
          {hasPw ? t.changePasswordHelp : t.setPasswordHelp}
        </p>

        <form onSubmit={handleSavePassword} className="space-y-4">
          {passwordError ? (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-3 rounded-xl text-sm font-semibold">
              {passwordError}
            </div>
          ) : null}
          {passwordSuccess ? (
            <div className="bg-emerald-500/10 border border-emerald-500/50 text-emerald-400 p-3 rounded-xl text-sm">
              {passwordSuccess}
            </div>
          ) : null}

          <div>
            <label className="profile-field-label" htmlFor="dash-new-password">
              {hasPw ? t.newPasswordLabel : t.password}
            </label>
            <input
              id="dash-new-password"
              type="password"
              value={passwordDraft}
              onChange={(e) => {
                setPasswordDraft(e.target.value);
                setPasswordError('');
                setPasswordSuccess('');
              }}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              required
              disabled={savingPassword}
              className="profile-field-input text-left"
              dir="ltr"
              autoComplete="new-password"
            />
          </div>

          <div>
            <label className="profile-field-label" htmlFor="dash-confirm-password">
              {t.confirmPasswordLabel}
            </label>
            <input
              id="dash-confirm-password"
              type="password"
              value={passwordConfirmDraft}
              onChange={(e) => {
                setPasswordConfirmDraft(e.target.value);
                setPasswordError('');
                setPasswordSuccess('');
              }}
              minLength={PASSWORD_MIN_LENGTH}
              maxLength={PASSWORD_MAX_LENGTH}
              required
              disabled={savingPassword}
              className="profile-field-input text-left"
              dir="ltr"
              autoComplete="new-password"
            />
          </div>

          <button
            type="submit"
            disabled={savingPassword || !passwordDraft || !passwordConfirmDraft}
            className="btn btn-primary gap-2 px-5 disabled:opacity-60"
          >
            {savingPassword ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Lock className="w-4 h-4" />
            )}
            {hasPw ? t.savePassword : t.setPasswordSubmit}
          </button>
        </form>
      </div>
    </div>
  );
}
