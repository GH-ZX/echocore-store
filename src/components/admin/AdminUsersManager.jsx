import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Ban,
  Bell,
  BadgeCheck,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Settings2,
  ShieldOff,
  UserRound,
  Wrench,
} from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import BanDurationField from './BanDurationField';
import AdminUserDetail from './AdminUserDetail';
import {
  adminBanUser,
  adminBroadcastMessage,
  adminNotifyUser,
  adminSaveMaintenanceSettings,
  adminSaveSiteModerationSettings,
  adminUnbanUser,
  adminUnverifyUser,
  adminVerifyUser,
  fetchAdminUsers,
  isUserRowBanned,
  isUserRowVerified,
} from '../../lib/adminModeration';
import {
  getAdminDashboardPath,
  getAdminOrdersPath,
  getAdminUserPath,
  resolveAdminUserRouteParamFromPath,
} from '../../lib/adminRoutes';
import { getProfileUsername } from '../../lib/username';
import { fetchSiteStatus } from '../../lib/siteStatus';
import { formatMessage } from '../../lib/i18n';
import { getProfileAdminLabel, getProfileDisplayName, profileNamesDiffer } from '../../lib/username';

const BROADCAST_KINDS = ['announcement', 'warning', 'maintenance'];

export default function AdminUsersManager({
  t = {},
  lang = 'ar',
  onNotify,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeUserParam = resolveAdminUserRouteParamFromPath(location.pathname);
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [requireVerifiedAccounts, setRequireVerifiedAccounts] = useState(false);

  const [maintenanceLoading, setMaintenanceLoading] = useState(true);
  const [maintenanceSaving, setMaintenanceSaving] = useState(false);
  const [maintenanceEnabled, setMaintenanceEnabled] = useState(false);
  const [maintenanceMessageAr, setMaintenanceMessageAr] = useState('');
  const [maintenanceMessageEn, setMaintenanceMessageEn] = useState('');
  const [maintenanceAllowAdmins, setMaintenanceAllowAdmins] = useState(true);
  const [maintenanceBroadcast, setMaintenanceBroadcast] = useState(false);

  const [broadcastKind, setBroadcastKind] = useState('announcement');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [broadcastLink, setBroadcastLink] = useState('');
  const [broadcastSending, setBroadcastSending] = useState(false);

  const [banTarget, setBanTarget] = useState(null);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('permanent');
  const [banDays, setBanDays] = useState('7');
  const [banLoading, setBanLoading] = useState(false);

  const [messageTarget, setMessageTarget] = useState(null);
  const [messageKind, setMessageKind] = useState('announcement');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  const [unbanTarget, setUnbanTarget] = useState(null);
  const [unbanLoading, setUnbanLoading] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);

  const loadUsers = useCallback(async (query = search) => {
    setUsersLoading(true);
    try {
      const rows = await fetchAdminUsers(query);
      setUsers(rows);
    } catch (err) {
      notifyError(err.message);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [notifyError, search]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    setMaintenanceLoading(true);
    try {
      const status = await fetchSiteStatus();
      setRequireVerifiedAccounts(!!status.requireVerifiedAccounts);
      setMaintenanceEnabled(!!status.maintenanceEnabled);
      setMaintenanceMessageAr(status.maintenanceMessageAr || '');
      setMaintenanceMessageEn(status.maintenanceMessageEn || '');
      setMaintenanceAllowAdmins(status.maintenanceAllowAdmins !== false);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSettingsLoading(false);
      setMaintenanceLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    if (!routeUserParam) {
      loadUsers();
    }
    loadSettings();
  }, [routeUserParam, loadUsers, loadSettings]);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearch(searchInput.trim());
    loadUsers(searchInput.trim());
  };

  const handleSaveSiteSettings = async () => {
    setSettingsSaving(true);
    try {
      await adminSaveSiteModerationSettings({ requireVerified: requireVerifiedAccounts });
      notifySuccess(t.adminSiteSettingsSaved);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleSaveMaintenance = async () => {
    setMaintenanceSaving(true);
    try {
      await adminSaveMaintenanceSettings({
        enabled: maintenanceEnabled,
        messageAr: maintenanceMessageAr,
        messageEn: maintenanceMessageEn,
        allowAdmins: maintenanceAllowAdmins,
        broadcastNotice: maintenanceBroadcast,
      });
      notifySuccess(t.adminMaintenanceSaved);
      setMaintenanceBroadcast(false);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const handleBroadcast = async (event) => {
    event.preventDefault();
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      notifyError(t.adminBroadcastRequired);
      return;
    }
    setBroadcastSending(true);
    try {
      const count = await adminBroadcastMessage({
        kind: broadcastKind,
        title: broadcastTitle.trim(),
        body: broadcastBody.trim(),
        link: broadcastLink.trim() || null,
      });
      notifySuccess(formatMessage(t.adminBroadcastSent, { count }));
      setBroadcastTitle('');
      setBroadcastBody('');
      setBroadcastLink('');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBroadcastSending(false);
    }
  };

  const handleBanConfirm = async () => {
    if (!banTarget?.id || !banReason.trim()) {
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
      await adminBanUser(banTarget.id, banReason.trim(), expiresAt);
      notifySuccess(formatMessage(t.adminBanSuccess, { name: banTarget.name || banTarget.email }));
      setBanTarget(null);
      setBanReason('');
      await loadUsers();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnbanConfirm = async () => {
    if (!unbanTarget?.id) return;
    setUnbanLoading(true);
    try {
      await adminUnbanUser(unbanTarget.id);
      notifySuccess(formatMessage(t.adminUnbanSuccess, { name: unbanTarget.name || unbanTarget.email }));
      setUnbanTarget(null);
      await loadUsers();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setUnbanLoading(false);
    }
  };

  const handleVerifyConfirm = async () => {
    if (!verifyTarget?.id) return;
    setVerifyLoading(true);
    try {
      if (isUserRowVerified(verifyTarget)) {
        await adminUnverifyUser(verifyTarget.id);
        notifySuccess(formatMessage(t.adminUnverifySuccess, { name: verifyTarget.name || verifyTarget.email }));
      } else {
        await adminVerifyUser(verifyTarget.id);
        notifySuccess(formatMessage(t.adminVerifySuccess, { name: verifyTarget.name || verifyTarget.email }));
      }
      setVerifyTarget(null);
      await loadUsers();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleDirectMessage = async (event) => {
    event.preventDefault();
    if (!messageTarget?.id || !messageTitle.trim() || !messageBody.trim()) {
      notifyError(t.adminBroadcastRequired);
      return;
    }
    setMessageSending(true);
    try {
      await adminNotifyUser(messageTarget.id, {
        kind: messageKind,
        title: messageTitle.trim(),
        body: messageBody.trim(),
      });
      notifySuccess(formatMessage(t.adminUserMessageSent, { name: messageTarget.name || messageTarget.email }));
      setMessageTarget(null);
      setMessageTitle('');
      setMessageBody('');
    } catch (err) {
      notifyError(err.message);
    } finally {
      setMessageSending(false);
    }
  };

  const broadcastKindLabel = useMemo(() => ({
    announcement: t.adminBroadcastKindAnnouncement,
    warning: t.adminBroadcastKindWarning,
    maintenance: t.adminBroadcastKindMaintenance,
  }), [t]);

  if (routeUserParam) {
    return (
      <AdminUserDetail
        t={t}
        lang={lang}
        userRouteParam={routeUserParam}
        onBack={() => navigate(getAdminDashboardPath('users'))}
        onNotify={onNotify}
        onOpenOrders={(username) => navigate(getAdminOrdersPath({ username }))}
      />
    );
  }

  return (
    <div className="space-y-6">
      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <UserRound className="w-5 h-5 text-[var(--accent)] mt-0.5" />
            <div>
              <h2 className="text-xl font-black">{t.adminUsersTitle}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1">{t.adminUsersDesc}</p>
            </div>
          </div>
          <button type="button" onClick={() => loadUsers()} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" />
            {t.refresh}
          </button>
        </div>

        <form onSubmit={handleSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 start-3 text-[var(--text-muted)]" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              className="input w-full ps-9"
              placeholder={t.adminUsersSearchPlaceholder}
            />
          </div>
          <button type="submit" className="btn btn-secondary">{t.adminUsersSearch}</button>
        </form>

        {usersLoading ? (
          <div className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--accent)]" /></div>
        ) : users.length === 0 ? (
          <p className="text-sm text-[var(--text-sec)] text-center py-8">{t.adminUsersEmpty}</p>
        ) : (
          <div className="space-y-2">
            {users.map((row) => {
              const banned = isUserRowBanned(row);
              const verified = isUserRowVerified(row);
              return (
                <div
                  key={row.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(getAdminUserPath(getProfileUsername(row) || row.id))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(getAdminUserPath(getProfileUsername(row) || row.id));
                    }
                  }}
                  className="admin-user-row rounded-xl border border-[var(--border)] p-4 flex flex-wrap items-start justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-sm flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[var(--accent)]">{getProfileAdminLabel(row, t.adminUsersUnnamed)}</span>
                      {verified && <span className="admin-user-badge admin-user-badge--verified">{t.adminUserVerified}</span>}
                    </div>
                    {profileNamesDiffer(row) && (
                      <div className="text-xs text-[var(--text-sec)] mt-0.5">{getProfileDisplayName(row)}</div>
                    )}
                    <div className="text-xs text-[var(--text-muted)] mt-0.5 break-all">{row.email}</div>
                    <div className="text-xs text-[var(--text-sec)] mt-1">
                      {t.balance}: ${parseFloat(row.balance || 0).toFixed(2)}
                    </div>
                    {banned && (
                      <div className="text-xs text-red-400 mt-1">
                        {row.ban_expires_at ? formatMessage(t.adminUserBannedUntil, {
                          date: new Date(row.ban_expires_at).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US'),
                        }) : t.adminUserBannedPermanent}
                        {row.ban_reason ? ` — ${row.ban_reason}` : ''}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => setVerifyTarget(row)}
                      className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                    >
                      <BadgeCheck className="w-3.5 h-3.5" />
                      {verified ? t.adminUnverifyUser : t.adminVerifyUser}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMessageTarget(row);
                        setMessageKind('announcement');
                        setMessageTitle('');
                        setMessageBody('');
                      }}
                      className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      {t.adminUserMessage}
                    </button>
                    {banned ? (
                      <button type="button" onClick={() => setUnbanTarget(row)} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5">
                        <ShieldOff className="w-3.5 h-3.5" />
                        {t.adminUnbanUser}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setBanTarget(row);
                          setBanReason('');
                          setBanDuration('permanent');
                          setBanDays('7');
                        }}
                        className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5 border-red-500/30 text-red-400"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        {t.adminBanUser}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Settings2 className="w-5 h-5 text-sky-400 mt-0.5" />
          <div>
            <h2 className="text-xl font-black">{t.adminSiteSettingsTitle}</h2>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.adminSiteSettingsDesc}</p>
          </div>
        </div>
        {settingsLoading ? (
          <div className="py-6 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--accent)]" /></div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={requireVerifiedAccounts}
                onChange={(event) => setRequireVerifiedAccounts(event.target.checked)}
                className="w-4 h-4 accent-[var(--accent)]"
              />
              <span className="text-sm font-semibold">{t.adminRequireVerifiedAccounts}</span>
            </label>
            <p className="text-xs text-[var(--text-muted)]">{t.adminRequireVerifiedAccountsHelp}</p>
            <button type="button" onClick={handleSaveSiteSettings} disabled={settingsSaving} className="btn btn-primary">
              {settingsSaving ? t.sending : t.adminSaveSiteSettings}
            </button>
          </div>
        )}
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Megaphone className="w-5 h-5 text-sky-400 mt-0.5" />
          <div>
            <h2 className="text-xl font-black">{t.adminBroadcastTitle}</h2>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.adminBroadcastDesc}</p>
          </div>
        </div>
        <form onSubmit={handleBroadcast} className="space-y-3">
          <div className="inbox-filter-bar">
            {BROADCAST_KINDS.map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setBroadcastKind(kind)}
                className={`inbox-filter-chip ${broadcastKind === kind ? 'inbox-filter-chip--active' : ''}`}
              >
                {broadcastKindLabel[kind]}
              </button>
            ))}
          </div>
          <input value={broadcastTitle} onChange={(e) => setBroadcastTitle(e.target.value)} className="input w-full" placeholder={t.adminBroadcastTitlePlaceholder} maxLength={120} />
          <textarea value={broadcastBody} onChange={(e) => setBroadcastBody(e.target.value)} className="input w-full min-h-[120px]" placeholder={t.adminBroadcastBodyPlaceholder} maxLength={2000} />
          <input value={broadcastLink} onChange={(e) => setBroadcastLink(e.target.value)} className="input w-full" placeholder={t.adminBroadcastLinkPlaceholder} />
          <button type="submit" disabled={broadcastSending} className="btn btn-primary">
            {broadcastSending ? t.sending : t.adminBroadcastSend}
          </button>
        </form>
      </section>

      <section className="card p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Wrench className="w-5 h-5 text-amber-400 mt-0.5" />
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black">{t.adminMaintenanceTitle}</h2>
            <p className="text-sm text-[var(--text-sec)] mt-1">{t.adminMaintenanceDescSoft}</p>
          </div>
        </div>
        {maintenanceLoading ? (
          <div className="py-8 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-[var(--accent)]" /></div>
        ) : (
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={maintenanceEnabled} onChange={(e) => setMaintenanceEnabled(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm font-semibold">{t.adminMaintenanceEnabled}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={maintenanceAllowAdmins} onChange={(e) => setMaintenanceAllowAdmins(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm">{t.adminMaintenanceAllowAdmins}</span>
            </label>
            <textarea value={maintenanceMessageAr} onChange={(e) => setMaintenanceMessageAr(e.target.value)} className="input w-full min-h-[88px]" placeholder={t.adminMaintenanceMessageAr} />
            <textarea value={maintenanceMessageEn} onChange={(e) => setMaintenanceMessageEn(e.target.value)} className="input w-full min-h-[88px]" placeholder={t.adminMaintenanceMessageEn} />
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={maintenanceBroadcast} onChange={(e) => setMaintenanceBroadcast(e.target.checked)} className="w-4 h-4 accent-[var(--accent)]" />
              <span className="text-sm">{t.adminMaintenanceBroadcast}</span>
            </label>
            <button type="button" onClick={handleSaveMaintenance} disabled={maintenanceSaving} className="btn btn-primary">
              {maintenanceSaving ? t.sending : t.adminSaveMaintenance}
            </button>
          </div>
        )}
      </section>

      <Modal
        open={!!banTarget}
        onClose={banLoading ? undefined : () => setBanTarget(null)}
        closeOnBackdrop={!banLoading}
        closeOnEscape={!banLoading}
        size="md"
        panelClassName="p-5 space-y-3"
        scrollable={false}
        ariaLabelledBy="admin-ban-user-title"
      >
        <h3 id="admin-ban-user-title" className="text-lg font-bold">{formatMessage(t.adminBanConfirmTitle, { name: banTarget?.name || banTarget?.email })}</h3>
        <p className="text-sm text-[var(--text-sec)]">{t.adminBanConfirmMessage}</p>
        <textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} className="input w-full min-h-[88px]" placeholder={t.adminBanReasonPlaceholder} maxLength={500} />
        <BanDurationField t={t} duration={banDuration} onDurationChange={setBanDuration} banDays={banDays} onBanDaysChange={setBanDays} />
        <div className="flex gap-2">
          <button type="button" disabled={banLoading} onClick={handleBanConfirm} className="btn flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white border-red-600">
            {banLoading ? t.sending : t.adminBanUser}
          </button>
          <button type="button" disabled={banLoading} onClick={() => setBanTarget(null)} className="btn btn-secondary flex-1 py-2.5">{t.cancel}</button>
        </div>
      </Modal>

      <ConfirmDialog open={!!unbanTarget} title={t.adminUnbanConfirmTitle} message={formatMessage(t.adminUnbanConfirmMessage, { name: unbanTarget?.name || unbanTarget?.email || '' })} confirmLabel={t.adminUnbanUser} cancelLabel={t.cancel} loading={unbanLoading} onConfirm={handleUnbanConfirm} onCancel={() => !unbanLoading && setUnbanTarget(null)} />

      <ConfirmDialog
        open={!!verifyTarget}
        title={isUserRowVerified(verifyTarget) ? t.adminUnverifyConfirmTitle : t.adminVerifyConfirmTitle}
        message={formatMessage(isUserRowVerified(verifyTarget) ? t.adminUnverifyConfirmMessage : t.adminVerifyConfirmMessage, { name: verifyTarget?.name || verifyTarget?.email || '' })}
        confirmLabel={isUserRowVerified(verifyTarget) ? t.adminUnverifyUser : t.adminVerifyUser}
        cancelLabel={t.cancel}
        loading={verifyLoading}
        onConfirm={handleVerifyConfirm}
        onCancel={() => !verifyLoading && setVerifyTarget(null)}
      />

      <Modal
        open={!!messageTarget}
        onClose={messageSending ? undefined : () => setMessageTarget(null)}
        closeOnBackdrop={!messageSending}
        closeOnEscape={!messageSending}
        size="md"
        panelClassName="p-5"
        scrollable={false}
        ariaLabelledBy="admin-direct-message-title"
      >
        <form onSubmit={handleDirectMessage} className="space-y-3">
          <h3 id="admin-direct-message-title" className="text-lg font-bold">{formatMessage(t.adminUserMessageTitle, { name: messageTarget?.name || messageTarget?.email })}</h3>
          <div className="inbox-filter-bar">
            {['announcement', 'warning'].map((kind) => (
              <button key={kind} type="button" onClick={() => setMessageKind(kind)} className={`inbox-filter-chip ${messageKind === kind ? 'inbox-filter-chip--active' : ''}`}>{broadcastKindLabel[kind]}</button>
            ))}
          </div>
          <input value={messageTitle} onChange={(e) => setMessageTitle(e.target.value)} className="input w-full" placeholder={t.adminBroadcastTitlePlaceholder} maxLength={120} />
          <textarea value={messageBody} onChange={(e) => setMessageBody(e.target.value)} className="input w-full min-h-[120px]" placeholder={t.adminBroadcastBodyPlaceholder} maxLength={2000} />
          <div className="flex gap-2">
            <button type="submit" disabled={messageSending} className="btn btn-primary flex-1">{messageSending ? t.sending : t.adminUserMessageSend}</button>
            <button type="button" disabled={messageSending} onClick={() => setMessageTarget(null)} className="btn btn-secondary flex-1">{t.cancel}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}