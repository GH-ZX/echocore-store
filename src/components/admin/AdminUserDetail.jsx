import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  Bell,
  BadgeCheck,
  BadgeX,
  Copy,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  ShieldOff,
  Gift,
  ShoppingBag,
  UserRound,
} from 'lucide-react';
import { getAdminGiftPath, getAdminUserPath } from '../../lib/adminRoutes';
import {
  adminBanUser,
  adminGetUserByUsername,
  adminGetUserProfile,
  adminNotifyUser,
  adminUnbanUser,
  adminUnverifyUser,
  adminVerifyUser,
  isUserRowBanned,
} from '../../lib/adminModeration';
import {
  adminGenerateRecoveryLink,
  adminSendPasswordResetEmail,
  adminSetUserPassword,
} from '../../lib/adminUserAuth';
import { validatePasswordLength } from '../../lib/auth';
import { formatMessage } from '../../lib/i18n';
import { formatOrderDisplayId, getOrderStatusLabel } from '../../lib/orderReceipt';
import {
  formatProfileUsername,
  getProfileAdminLabel,
  getProfileDisplayName,
  getProfileUsername,
  isUuidLike,
  normalizeUsernameInput,
  profileNamesDiffer,
  validateUsername,
} from '../../lib/username';
import { adminChangeUsername, getUsernameErrorMessage } from '../../lib/usernameChange';
import BanDurationField from './BanDurationField';
import Modal from '../ui/Modal';

function formatAdminDate(value, lang) {
  if (!value) return '—';
  return new Date(value).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function InfoField({ label, value, mono = false, className = '' }) {
  return (
    <div className={`admin-user-info-field ${className}`}>
      <div className="admin-user-info-label">{label}</div>
      <div className={`admin-user-info-value ${mono ? 'font-mono text-xs break-all' : ''}`}>
        {value || '—'}
      </div>
    </div>
  );
}

export default function AdminUserDetail({
  t = {},
  lang = 'ar',
  userRouteParam,
  onBack,
  onNotify,
  onOpenOrders,
}) {
  const navigate = useNavigate();
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [banOpen, setBanOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('permanent');
  const [banDays, setBanDays] = useState('7');
  const [banLoading, setBanLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryLink, setRecoveryLink] = useState('');
  const [usernameDraft, setUsernameDraft] = useState('');
  const [usernameSaving, setUsernameSaving] = useState(false);


  const loadProfile = useCallback(async () => {
    if (!userRouteParam) return;

    setLoading(true);
    try {
      let userId = '';

      if (isUuidLike(userRouteParam)) {
        const legacyProfile = await adminGetUserProfile(userRouteParam);
        const username = getProfileUsername(legacyProfile);
        if (username) {
          navigate(getAdminUserPath(username), { replace: true });
          return;
        }
        userId = userRouteParam;
      } else {
        const resolved = await adminGetUserByUsername(userRouteParam);
        userId = resolved?.id || '';
      }

      if (!userId) {
        setProfile(null);
        return;
      }

      const data = await adminGetUserProfile(userId);
      setProfile(data);
      setUsernameDraft(getProfileUsername(data) || '');
    } catch (err) {
      notifyError(err.message);
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, [navigate, notifyError, userRouteParam]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleVerifyToggle = async () => {
    if (!profile?.id) return;
    setActionLoading(true);
    try {
      if (profile.verified_at) {
        await adminUnverifyUser(profile.id);
        notifySuccess(formatMessage(t.adminUnverifySuccess, { name: profile.name || profile.email }));
      } else {
        await adminVerifyUser(profile.id);
        notifySuccess(formatMessage(t.adminVerifySuccess, { name: profile.name || profile.email }));
      }
      await loadProfile();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleBan = async () => {
    if (!profile?.id || !banReason.trim()) {
      notifyError(t.adminBanReasonRequired);
      return;
    }
    setBanLoading(true);
    try {
      let expiresAt = null;
      if (banDuration === 'temporary') {
        const days = Math.max(1, Math.min(365, parseInt(banDays, 10) || 1));
        expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
      }
      await adminBanUser(profile.id, banReason.trim(), expiresAt);
      notifySuccess(formatMessage(t.adminBanSuccess, { name: profile.name || profile.email }));
      setBanOpen(false);
      setBanReason('');
      await loadProfile();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnban = async () => {
    if (!profile?.id) return;
    setActionLoading(true);
    try {
      await adminUnbanUser(profile.id);
      notifySuccess(formatMessage(t.adminUnbanSuccess, { name: profile.name || profile.email }));
      await loadProfile();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendMessage = async (event) => {
    event.preventDefault();
    if (!profile?.id || !messageTitle.trim() || !messageBody.trim()) {
      notifyError(t.adminBroadcastRequired);
      return;
    }
    setActionLoading(true);
    try {
      await adminNotifyUser(profile.id, {
        kind: 'announcement',
        title: messageTitle.trim(),
        body: messageBody.trim(),
      });
      notifySuccess(formatMessage(t.adminUserMessageSent, { name: profile.name || profile.email }));
      setMessageOpen(false);
      setMessageTitle('');
      setMessageBody('');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendResetEmail = async () => {
    if (!profile?.id) return;
    setPasswordLoading(true);
    try {
      await adminSendPasswordResetEmail(profile.id);
      notifySuccess(formatMessage(t.adminPasswordResetEmailSent, { email: profile.email }));
    } catch (err) {
      notifyError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    if (!profile?.id) return;
    setPasswordLoading(true);
    try {
      const result = await adminGenerateRecoveryLink(profile.id);
      setRecoveryLink(result.recoveryLink || '');
      notifySuccess(t.adminRecoveryLinkGenerated);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!recoveryLink) return;
    try {
      await navigator.clipboard.writeText(recoveryLink);
      notifySuccess(t.adminRecoveryLinkCopied);
    } catch {
      notifyError(t.adminRecoveryLinkCopyFailed);
    }
  };

  const handleChangeUsername = async (event) => {
    event.preventDefault();
    if (!profile?.id) return;

    const check = validateUsername(usernameDraft);
    if (!check.ok) {
      notifyError(getUsernameErrorMessage(check.code, t));
      return;
    }

    setUsernameSaving(true);
    try {
      const result = await adminChangeUsername(profile.id, check.value);
      const nextUsername = result?.username || check.value;
      notifySuccess(t.adminUsernameChangedSuccess);
      if (nextUsername && nextUsername !== getProfileUsername(profile)) {
        navigate(getAdminUserPath(nextUsername), { replace: true });
        return;
      }
      await loadProfile();
    } catch (err) {
      notifyError(getUsernameErrorMessage(err.message, t) || err.message);
    } finally {
      setUsernameSaving(false);
    }
  };

  const handleSetPassword = async (event) => {
    event.preventDefault();
    const validation = validatePasswordLength(newPassword);
    if (!validation.valid) {
      notifyError(validation.code === 'too_long' ? t.passwordMaxLength : t.passwordLengthRange);
      return;
    }
    if (newPassword !== confirmPassword) {
      notifyError(t.passwordMismatch);
      return;
    }
    setPasswordLoading(true);
    try {
      await adminSetUserPassword(profile.id, newPassword);
      notifySuccess(t.adminPasswordSetSuccess);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setPasswordLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 text-center">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="card p-8 text-center space-y-4">
        <p className="text-[var(--text-sec)]">{t.adminUserNotFound}</p>
        <button type="button" onClick={onBack} className="btn btn-secondary">{t.back}</button>
      </div>
    );
  }

  const banned = isUserRowBanned(profile);
  const verified = !!profile.verified_at;
  const recentOrders = Array.isArray(profile.recentOrders) ? profile.recentOrders : [];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
        <ArrowLeft className="w-3.5 h-3.5" />
        {t.adminBackToUsers}
      </button>

      <div className="card p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            {profile.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt=""
                className="w-14 h-14 rounded-2xl object-cover border border-[var(--border)]"
              />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-[var(--accent)]/15 flex items-center justify-center text-[var(--accent)]">
                <UserRound className="w-7 h-7" strokeWidth={2} />
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-black truncate font-mono text-[var(--accent)]">
                {getProfileAdminLabel(profile, t.adminUsersUnnamed)}
              </h2>
              {profileNamesDiffer(profile) && (
                <div className="text-sm text-[var(--text-sec)] mt-0.5 truncate">{getProfileDisplayName(profile)}</div>
              )}
              <div className="text-sm text-[var(--text-muted)] mt-0.5 break-all">{profile.email}</div>
              <div className="flex flex-wrap gap-2 mt-2">
                {verified && <span className="admin-user-badge admin-user-badge--verified">{t.adminUserVerified}</span>}
                {banned && <span className="admin-user-badge admin-user-badge--banned">{t.adminUserBannedBadge}</span>}
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={actionLoading} onClick={handleVerifyToggle} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              {verified ? <BadgeX className="w-3.5 h-3.5" /> : <BadgeCheck className="w-3.5 h-3.5" />}
              {verified ? t.adminUnverifyUser : t.adminVerifyUser}
            </button>
            <button type="button" onClick={() => setMessageOpen(true)} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              {t.adminUserMessage}
            </button>
            {profile?.role !== 'admin' && (
              <button
                type="button"
                onClick={() => navigate(getAdminGiftPath({
                  username: getProfileUsername(profile),
                  returnTo: getAdminUserPath(getProfileUsername(profile) || profile.id),
                }))}
                className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 border-pink-500/30 text-pink-200"
              >
                <Gift className="w-3.5 h-3.5" />
                {t.adminGiftProduct}
              </button>
            )}
            {banned ? (
              <button type="button" disabled={actionLoading} onClick={handleUnban} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
                <ShieldOff className="w-3.5 h-3.5" />
                {t.adminUnbanUser}
              </button>
            ) : (
              <button type="button" onClick={() => setBanOpen(true)} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 border-red-500/30 text-red-400">
                <Ban className="w-3.5 h-3.5" />
                {t.adminBanUser}
              </button>
            )}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--text-muted)]">{t.balance}</div>
            <div className="text-lg font-black mt-1">${parseFloat(profile.balance || 0).toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--text-muted)]">{t.adminUserOrdersCount}</div>
            <div className="text-lg font-black mt-1">{profile.orderCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--text-muted)]">{t.adminUserRechargesCount}</div>
            <div className="text-lg font-black mt-1">{profile.rechargeCount ?? 0}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--text-muted)]">{t.adminUserDevBalance}</div>
            <div className="text-lg font-black mt-1">${parseFloat(profile.dev_test_balance || 0).toFixed(2)}</div>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold mb-3">{t.adminUserSectionAccount}</h3>
          <form onSubmit={handleChangeUsername} className="rounded-xl border border-[var(--border)] p-4 space-y-3 mb-4 max-w-md">
            <div>
              <div className="text-sm font-semibold">{t.adminChangeUsername}</div>
              <p className="text-xs text-[var(--text-sec)] mt-1">{t.adminChangeUsernameHelp}</p>
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 start-3 flex items-center text-[var(--text-muted)] font-mono text-sm pointer-events-none">@</span>
              <input
                type="text"
                value={usernameDraft}
                onChange={(e) => setUsernameDraft(normalizeUsernameInput(e.target.value))}
                className="input w-full ps-7 font-mono"
                maxLength={20}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <button
              type="submit"
              disabled={usernameSaving || normalizeUsernameInput(usernameDraft) === getProfileUsername(profile)}
              className="btn btn-secondary text-xs py-2 px-3"
            >
              {usernameSaving ? t.sending : t.adminUsernameSave}
            </button>
          </form>
          <div className="admin-user-info-grid">
            <InfoField label={t.adminUserIdLabel} value={profile.id} mono />
            <InfoField label={t.adminUserUsernameLabel} value={formatProfileUsername(profile.username)} mono />
            <InfoField label={t.adminUserEmailLabel} value={profile.email} />
            <InfoField label={t.adminUserRoleLabel} value={profile.role} />
            <InfoField label={t.adminUserJoinedLabel} value={formatAdminDate(profile.created_at, lang)} />
            <InfoField label={t.adminUserAuthCreatedLabel} value={formatAdminDate(profile.auth_created_at, lang)} />
            <InfoField label={t.adminUserLastSignInLabel} value={formatAdminDate(profile.last_sign_in_at, lang)} />
            <InfoField label={t.adminUserEmailConfirmedLabel} value={formatAdminDate(profile.email_confirmed_at, lang)} />
            <InfoField label={t.adminUserVerifiedLabel} value={verified ? formatAdminDate(profile.verified_at, lang) : t.adminUserNotVerified} />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold mb-3">{t.adminUserSectionProfile}</h3>
          <div className="admin-user-info-grid">
            <InfoField label={t.adminUserPhoneLabel} value={profile.phone} />
            <InfoField label={t.adminUserCountryLabel} value={profile.country} />
            <InfoField label={t.adminUserDiscord} value={profile.discord_username} />
            <InfoField label={t.adminUserPlayerUid} value={profile.default_player_uid} />
            <InfoField label={t.adminUserFavoriteGame} value={profile.favorite_game} />
            <InfoField label={t.adminUserBio} value={profile.bio} className="sm:col-span-2 lg:col-span-3" />
          </div>
        </div>

        {banned && (
          <div>
            <h3 className="text-sm font-bold mb-3 text-red-300">{t.adminUserSectionModeration}</h3>
            <div className="admin-user-info-grid">
              <InfoField label={t.adminBanReasonLabel} value={profile.ban_reason} />
              <InfoField label={t.adminUserBannedAtLabel} value={formatAdminDate(profile.banned_at, lang)} />
              <InfoField
                label={t.adminUserBanExpiresLabel}
                value={profile.ban_expires_at ? formatAdminDate(profile.ban_expires_at, lang) : t.adminUserBannedPermanent}
              />
              <InfoField label={t.adminUserBannedByLabel} value={profile.banned_by_name || profile.banned_by} mono={!!profile.banned_by && !profile.banned_by_name} />
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
            <KeyRound className="w-4 h-4" />
            {t.adminUserSectionPassword}
          </h3>
          <p className="text-xs text-[var(--text-sec)] mb-3">{t.adminUserPasswordHelp}</p>
          <div className="flex flex-wrap gap-2 mb-4">
            <button type="button" disabled={passwordLoading} onClick={handleSendResetEmail} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              {passwordLoading ? t.sending : t.adminSendPasswordResetEmail}
            </button>
            <button type="button" disabled={passwordLoading} onClick={handleGenerateLink} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
              <Link2 className="w-3.5 h-3.5" />
              {passwordLoading ? t.sending : t.adminGenerateRecoveryLink}
            </button>
          </div>
          {recoveryLink && (
            <div className="rounded-xl border border-[var(--border)] p-3 mb-4 space-y-2">
              <div className="text-xs text-[var(--text-muted)]">{t.adminRecoveryLinkLabel}</div>
              <div className="text-xs font-mono break-all text-[var(--text-sec)]">{recoveryLink}</div>
              <button type="button" onClick={handleCopyLink} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
                <Copy className="w-3.5 h-3.5" />
                {t.adminCopyRecoveryLink}
              </button>
            </div>
          )}
          <form onSubmit={handleSetPassword} className="rounded-xl border border-[var(--border)] p-4 space-y-3 max-w-md">
            <div className="text-sm font-semibold">{t.adminSetPasswordManually}</div>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input w-full"
              placeholder={t.adminNewPasswordPlaceholder}
              autoComplete="new-password"
            />
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="input w-full"
              placeholder={t.adminConfirmPasswordPlaceholder}
              autoComplete="new-password"
            />
            <button type="submit" disabled={passwordLoading} className="btn btn-primary">
              {passwordLoading ? t.sending : t.adminSetPasswordSubmit}
            </button>
          </form>
        </div>

        {recentOrders.length > 0 && (
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="text-sm font-bold">{t.adminUserRecentOrders}</h3>
              {onOpenOrders && (
                <button type="button" onClick={() => onOpenOrders(profile.username)} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5" />
                  {t.adminViewUserOrders}
                </button>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs">
                    <th className="text-start p-3">{t.adminOrderIdShort}</th>
                    <th className="text-start p-3">{t.adminOrderTotal}</th>
                    <th className="text-start p-3">{t.adminOrderStatus}</th>
                    <th className="text-start p-3">{t.adminOrderDate}</th>
                  </tr>
                </thead>
                <tbody>
                  {recentOrders.map((order) => (
                    <tr key={order.id} className="border-b border-[var(--border)] last:border-0">
                      <td className="p-3 font-mono text-xs">{formatOrderDisplayId(order)}</td>
                      <td className="p-3">${parseFloat(order.total || 0).toFixed(2)}</td>
                      <td className="p-3">{getOrderStatusLabel(order.status, t)}</td>
                      <td className="p-3 text-[var(--text-sec)]">{formatAdminDate(order.created_at, lang)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <Modal
        open={banOpen}
        onClose={banLoading ? undefined : () => setBanOpen(false)}
        closeOnBackdrop={!banLoading}
        closeOnEscape={!banLoading}
        size="md"
        panelClassName="p-5 space-y-3"
        scrollable={false}
        ariaLabelledBy="admin-user-ban-title"
      >
        <h3 id="admin-user-ban-title" className="text-lg font-bold">{formatMessage(t.adminBanConfirmTitle, { name: profile.name || profile.email })}</h3>
        <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} className="input w-full min-h-[88px]" placeholder={t.adminBanReasonPlaceholder} maxLength={500} />
        <BanDurationField t={t} duration={banDuration} onDurationChange={setBanDuration} banDays={banDays} onBanDaysChange={setBanDays} />
        <div className="flex gap-2">
          <button type="button" disabled={banLoading} onClick={handleBan} className="btn flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white border-red-600">
            {banLoading ? t.sending : t.adminBanUser}
          </button>
          <button type="button" disabled={banLoading} onClick={() => setBanOpen(false)} className="btn btn-secondary flex-1 py-2.5">{t.cancel}</button>
        </div>
      </Modal>

      <Modal
        open={messageOpen}
        onClose={actionLoading ? undefined : () => setMessageOpen(false)}
        closeOnBackdrop={!actionLoading}
        closeOnEscape={!actionLoading}
        size="md"
        panelClassName="p-5"
        scrollable={false}
        ariaLabelledBy="admin-user-message-title"
      >
        <form onSubmit={handleSendMessage} className="space-y-3">
          <h3 id="admin-user-message-title" className="text-lg font-bold">{formatMessage(t.adminUserMessageTitle, { name: profile.name || profile.email })}</h3>
          <input value={messageTitle} onChange={(e) => setMessageTitle(e.target.value)} className="input w-full" placeholder={t.adminBroadcastTitlePlaceholder} maxLength={120} />
          <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} className="input w-full min-h-[120px]" placeholder={t.adminBroadcastBodyPlaceholder} maxLength={2000} />
          <div className="flex gap-2">
            <button type="submit" disabled={actionLoading} className="btn btn-primary flex-1">{actionLoading ? t.sending : t.adminUserMessageSend}</button>
            <button type="button" disabled={actionLoading} onClick={() => setMessageOpen(false)} className="btn btn-secondary flex-1">{t.cancel}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}