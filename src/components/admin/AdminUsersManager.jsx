import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BadgeCheck,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Megaphone,
  RefreshCw,
  Search,
  Settings2,
  UserRound,
  Wrench,
} from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import Modal from '../ui/Modal';
import AdminUserDetail from './AdminUserDetail';
import {
  adminBroadcastMessage,
  adminNotifyUser,
  adminSaveMaintenanceSettings,
  adminSaveSiteModerationSettings,
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
const PAGE_SIZE = 10;

const STATUS_FILTERS = [
  { id: 'all', labelKey: 'adminUsersFilterAll' },
  { id: 'verified', labelKey: 'adminUsersFilterVerified' },
  { id: 'unverified', labelKey: 'adminUsersFilterUnverified' },
  { id: 'banned', labelKey: 'adminUsersFilterBanned' },
  { id: 'active', labelKey: 'adminUsersFilterActive' },
];

const BALANCE_FILTERS = [
  { id: 'all', labelKey: 'adminCustomerBalancesFilterAll' },
  { id: 'positive', labelKey: 'adminCustomerBalancesFilterPositive' },
  { id: 'zero', labelKey: 'adminCustomerBalancesFilterZero' },
];

/** Order-by presets (maps to admin_list_users p_order_by). */
const ORDER_OPTIONS = [
  { id: 'created_at', labelKey: 'adminUsersOrderNewest' },
  { id: 'balance', labelKey: 'adminUsersOrderTopWallet' },
  { id: 'total_spent', labelKey: 'adminUsersOrderBestCustomer' },
  { id: 'order_count', labelKey: 'adminUsersOrderMostOrders' },
  { id: 'name', labelKey: 'adminUsersOrderName' },
  { id: 'username', labelKey: 'adminUsersOrderUsername' },
];

function userInitials(row) {
  const label = getProfileDisplayName(row) || row?.username || row?.email || '?';
  const parts = String(label).trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return String(label).slice(0, 2).toUpperCase();
}

export default function AdminUsersManager({
  t = {},
  lang = 'ar',
  onNotify,
  onSiteStatusChanged,
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const routeUserParam = resolveAdminUserRouteParamFromPath(location.pathname);
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const [usersLoading, setUsersLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [balanceFilter, setBalanceFilter] = useState('all');
  const [orderBy, setOrderBy] = useState('created_at');

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

  const [messageTarget, setMessageTarget] = useState(null);
  const [messageKind, setMessageKind] = useState('announcement');
  const [messageTitle, setMessageTitle] = useState('');
  const [messageBody, setMessageBody] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  const [verifyTarget, setVerifyTarget] = useState(null);
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [maintenanceConfirmOpen, setMaintenanceConfirmOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(totalUsers / PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages - 1);

  const loadUsers = useCallback(async (
    query = search,
    pageIndex = safePage,
    status = statusFilter,
    bal = balanceFilter,
    order = orderBy,
  ) => {
    setUsersLoading(true);
    try {
      const { rows, total } = await fetchAdminUsers(
        query,
        PAGE_SIZE,
        pageIndex * PAGE_SIZE,
        {
          orderBy: order,
          balanceFilter: bal,
          statusFilter: status,
        },
      );
      setUsers(Array.isArray(rows) ? rows : []);
      setTotalUsers(Number(total) || 0);
    } catch (err) {
      notifyError(err.message);
      setUsers([]);
      setTotalUsers(0);
    } finally {
      setUsersLoading(false);
    }
  }, [notifyError, search, safePage, statusFilter, balanceFilter, orderBy]);

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
      loadUsers(search, safePage, statusFilter, balanceFilter, orderBy);
    }
  }, [routeUserParam, loadUsers, search, safePage, statusFilter, balanceFilter, orderBy]);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    if (page > 0 && page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const handleSearch = (event) => {
    event.preventDefault();
    setPage(0);
    setSearch(searchInput.trim());
  };

  const setStatus = (id) => {
    setStatusFilter(id);
    setPage(0);
  };

  const setBalance = (id) => {
    setBalanceFilter(id);
    setPage(0);
  };

  const setOrder = (id) => {
    setOrderBy(id);
    setPage(0);
  };

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setStatusFilter('all');
    setBalanceFilter('all');
    setOrderBy('created_at');
    setPage(0);
  };

  const rangeStart = totalUsers === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(totalUsers, (safePage + 1) * PAGE_SIZE);
  const hasActiveFilters = search
    || statusFilter !== 'all'
    || balanceFilter !== 'all'
    || orderBy !== 'created_at';

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
        broadcastNotice: maintenanceEnabled && maintenanceBroadcast,
      });
      notifySuccess(
        maintenanceEnabled ? t.adminMaintenanceSavedOn : t.adminMaintenanceSavedOff,
      );
      setMaintenanceBroadcast(false);
      setMaintenanceConfirmOpen(false);
      await onSiteStatusChanged?.();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setMaintenanceSaving(false);
    }
  };

  const requestSaveMaintenance = () => {
    // Confirm only when turning ON (avoid accidental lockout of shoppers).
    if (maintenanceEnabled) {
      setMaintenanceConfirmOpen(true);
      return;
    }
    void handleSaveMaintenance();
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
      <section className="card overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <UserRound className="w-5 h-5 text-[var(--accent)] mt-0.5 shrink-0" />
            <div className="min-w-0">
              <h2 className="text-xl font-black">{t.adminUsersTitle}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1">{t.adminUsersDesc}</p>
            </div>
          </div>
          <div className="text-end shrink-0">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
              {t.adminCustomerBalancesTotal || t.adminUsersTitle}
            </div>
            <div className="font-mono font-black text-[var(--accent)] text-lg">
              {formatMessage(t.adminUsersCount || '{count}', { count: totalUsers })}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-4 border-b border-[var(--border)] space-y-2.5">
          <form onSubmit={handleSearch} className="flex flex-wrap gap-2">
            <div className="input flex items-center gap-2 flex-1 min-w-[10rem] !py-0 !px-2.5">
              <Search className="w-3.5 h-3.5 shrink-0 text-[var(--text-muted)] pointer-events-none" aria-hidden />
              <input
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                className="flex-1 min-w-0 bg-transparent border-0 outline-none shadow-none py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
                placeholder={t.adminUsersSearchPlaceholder}
              />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <span className="whitespace-nowrap">{t.adminUsersOrderBy}</span>
              <select
                value={orderBy}
                onChange={(e) => setOrder(e.target.value)}
                className="input !py-2 text-xs min-w-[9rem]"
              >
                {ORDER_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {t[opt.labelKey] || opt.id}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="action-chip !h-9 text-xs gap-1.5">
              <Search className="w-3.5 h-3.5" />
              {t.adminUsersSearch}
            </button>
            <button
              type="button"
              onClick={() => loadUsers(search, safePage, statusFilter, balanceFilter, orderBy)}
              className="action-chip !h-9 text-xs gap-1.5"
              title={t.refresh}
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            {hasActiveFilters && (
              <button type="button" onClick={clearFilters} className="action-chip !h-9 text-xs">
                {t.clearSearch}
              </button>
            )}
          </form>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatus(f.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  statusFilter === f.id
                    ? 'border-[var(--accent)]/50 text-[var(--accent)] bg-[var(--accent)]/10'
                    : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                }`}
              >
                {t[f.labelKey] || f.id}
              </button>
            ))}
            <span className="w-px self-stretch bg-[var(--border)] mx-0.5 hidden sm:block" aria-hidden />
            {BALANCE_FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setBalance(f.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
                  balanceFilter === f.id
                    ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                    : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                }`}
              >
                {t[f.labelKey] || f.id}
              </button>
            ))}
          </div>
        </div>

        {usersLoading ? (
          <div className="p-8 text-center">
            <Loader2 className="w-5 h-5 animate-spin mx-auto text-[var(--accent)]" />
          </div>
        ) : users.length === 0 ? (
          <p className="text-sm text-[var(--text-sec)] text-center py-8">{t.adminUsersEmpty}</p>
        ) : (
          <>
            <div className="divide-y divide-[var(--border)]">
              {users.map((row) => {
                const banned = isUserRowBanned(row);
                const verified = isUserRowVerified(row);
                const bal = parseFloat(row.balance || 0);
                const spent = parseFloat(row.total_spent || 0);
                const ordersN = Number(row.order_count || 0);
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
                    className="admin-user-row admin-user-row--compact flex items-center gap-2.5 px-3 sm:px-4 py-2.5"
                  >
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                        banned
                          ? 'bg-red-500/15 text-red-300'
                          : verified
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-[var(--accent)]/12 text-[var(--accent)]'
                      }`}
                      aria-hidden
                    >
                      {userInitials(row)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-mono text-xs font-semibold text-[var(--accent)] truncate">
                          {getProfileAdminLabel(row, t.adminUsersUnnamed)}
                        </span>
                        {verified && (
                          <span className="admin-user-badge admin-user-badge--verified shrink-0">
                            {t.adminUserVerifiedShort || t.adminUserVerified}
                          </span>
                        )}
                        {banned && (
                          <span className="admin-user-badge admin-user-badge--banned shrink-0">
                            {t.adminUserBannedBadge}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate" dir="ltr">
                        {row.email}
                        {profileNamesDiffer(row) ? ` · ${getProfileDisplayName(row)}` : ''}
                      </div>
                    </div>
                    <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono text-[var(--text-sec)] shrink-0 tabular-nums">
                      <span title={t.balance} className="text-emerald-400/90">${bal.toFixed(2)}</span>
                      <span title={t.adminUsersColSpent} className="text-[var(--text-muted)]">
                        {t.adminUsersColSpentShort}: ${spent.toFixed(0)}
                      </span>
                      <span title={t.adminUsersColOrders} className="text-[var(--text-muted)]">
                        {ordersN} {t.adminUsersColOrdersShort}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(event) => event.stopPropagation()}
                      onKeyDown={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setVerifyTarget(row)}
                        className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors"
                        title={verified ? t.adminUnverifyUser : t.adminVerifyUser}
                      >
                        <BadgeCheck className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMessageTarget(row);
                          setMessageKind('announcement');
                          setMessageTitle('');
                          setMessageBody('');
                        }}
                        className="p-1.5 rounded-lg border border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--accent)] hover:border-[var(--accent)]/40 transition-colors"
                        title={t.adminUserMessage}
                      >
                        <Bell className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="p-3 sm:p-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-muted)]">
                {formatMessage(t.adminCustomerBalancesPageRange || '{from}–{to} of {total}', {
                  from: rangeStart,
                  to: rangeEnd,
                  total: totalUsers,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 0 || usersLoading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="action-chip gap-1 text-xs disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t.prev || 'Prev'}
                </button>
                <span className="text-xs font-mono text-[var(--text-sec)] min-w-[4.5rem] text-center">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1 || usersLoading}
                  onClick={() => setPage((p) => p + 1)}
                  className="action-chip gap-1 text-xs disabled:opacity-40"
                >
                  {t.next || 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
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
            <button type="button" onClick={handleSaveSiteSettings} disabled={settingsSaving} className="btn btn-primary action-chip gap-2 !border-0">
              {settingsSaving ? t.sending : (t.save || t.adminSaveSiteSettings)}
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black">{t.adminMaintenanceTitle}</h2>
              <span
                className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                  maintenanceEnabled
                    ? 'border-amber-400/50 text-amber-200 bg-amber-500/15'
                    : 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                }`}
              >
                {maintenanceEnabled ? t.adminMaintenanceStatusOn : t.adminMaintenanceStatusOff}
              </span>
            </div>
            <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
              {t.adminMaintenanceDescSoft}
            </p>
            <ul className="mt-3 text-xs text-[var(--text-muted)] space-y-1 list-disc ps-4 leading-relaxed">
              <li>{t.adminMaintenanceEffectBanner}</li>
              <li>{t.adminMaintenanceEffectLogin}</li>
              <li>{t.adminMaintenanceEffectSignup}</li>
              <li>{t.adminMaintenanceEffectCommerce}</li>
              <li>{t.adminMaintenanceEffectBrowse}</li>
              <li>{t.adminMaintenanceEffectAdmin}</li>
            </ul>
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
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
              {t.adminMaintenanceAllowAdminsHelp}
            </p>
            <textarea value={maintenanceMessageAr} onChange={(e) => setMaintenanceMessageAr(e.target.value)} className="input w-full min-h-[88px]" placeholder={t.adminMaintenanceMessageAr} maxLength={500} />
            <textarea value={maintenanceMessageEn} onChange={(e) => setMaintenanceMessageEn(e.target.value)} className="input w-full min-h-[88px]" placeholder={t.adminMaintenanceMessageEn} maxLength={500} />
            <label className={`flex items-start gap-3 ${maintenanceEnabled ? 'cursor-pointer' : 'opacity-50'}`}>
              <input
                type="checkbox"
                checked={maintenanceBroadcast}
                onChange={(e) => setMaintenanceBroadcast(e.target.checked)}
                disabled={!maintenanceEnabled}
                className="w-4 h-4 accent-[var(--accent)] mt-0.5"
              />
              <span className="text-sm leading-relaxed">
                {t.adminMaintenanceBroadcast}
                <span className="block text-[11px] text-[var(--text-muted)] mt-0.5">
                  {t.adminMaintenanceBroadcastHelp}
                </span>
              </span>
            </label>
            <button
              type="button"
              onClick={requestSaveMaintenance}
              disabled={maintenanceSaving}
              className="btn btn-primary action-chip gap-2 !border-0"
            >
              {maintenanceSaving ? t.sending : t.adminSaveMaintenance}
            </button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={maintenanceConfirmOpen}
        title={t.adminMaintenanceConfirmTitle}
        message={t.adminMaintenanceConfirmMessage}
        confirmLabel={t.adminSaveMaintenance}
        cancelLabel={t.cancel}
        loading={maintenanceSaving}
        onConfirm={handleSaveMaintenance}
        onCancel={() => !maintenanceSaving && setMaintenanceConfirmOpen(false)}
      />

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