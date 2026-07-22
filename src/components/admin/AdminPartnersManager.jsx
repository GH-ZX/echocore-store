import { useCallback, useEffect, useState } from 'react';
import {
  Copy,
  Check,
  Handshake,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  Save,
  UserPlus,
} from 'lucide-react';
import {
  adminCreatePartnerInvite,
  adminSetUserPartnerTier,
  adminUpsertPartnerTier,
  fetchPartnerTiers,
  fetchRecentPartnerInvites,
  formatPartnerTierLabel,
} from '../../lib/partners';
import { fetchAdminUsers } from '../../lib/adminModeration';
import { formatMessage } from '../../lib/i18n';
import {
  formatProfileUsername,
  getProfileAdminLabel,
  getProfileDisplayName,
  getProfileUsername,
} from '../../lib/username';

export default function AdminPartnersManager({ t = {}, lang = 'ar', onNotify }) {
  const notifyError = (m) => onNotify?.(m, 'error');
  const notifySuccess = (m) => onNotify?.(m, 'success');

  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState([]);
  const [invites, setInvites] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [inviteTierId, setInviteTierId] = useState('');
  const [inviteMinutes, setInviteMinutes] = useState(15);
  const [inviteNote, setInviteNote] = useState('');
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [lastInvitePath, setLastInvitePath] = useState('');
  const [copied, setCopied] = useState(false);

  const [assignQuery, setAssignQuery] = useState('');
  const [assignResults, setAssignResults] = useState([]);
  const [assignSearching, setAssignSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [assignTierId, setAssignTierId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const [newSlug, setNewSlug] = useState('');
  const [newNameEn, setNewNameEn] = useState('');
  const [newNameAr, setNewNameAr] = useState('');
  const [newMarkup, setNewMarkup] = useState('5');
  const [creatingTier, setCreatingTier] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tList, iList] = await Promise.all([
        fetchPartnerTiers(),
        fetchRecentPartnerInvites(25),
      ]);
      setTiers(tList);
      setInvites(iList);
      setInviteTierId((prev) => prev || tList.find((x) => x.is_active)?.id || tList[0]?.id || '');
    } catch (e) {
      notifyError(e.message || t.partnerLoadFailed);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load once / manual refresh
  }, [t.partnerLoadFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const saveTier = async (tier, patch) => {
    setSavingId(tier.id);
    try {
      await adminUpsertPartnerTier({
        id: tier.id,
        slug: patch.slug ?? tier.slug,
        nameEn: patch.name_en ?? tier.name_en,
        nameAr: patch.name_ar ?? tier.name_ar,
        markupPercent: patch.markup_percent ?? tier.markup_percent,
        isActive: patch.is_active ?? tier.is_active,
        sortOrder: patch.sort_order ?? tier.sort_order,
      });
      notifySuccess(t.partnerTierSaved);
      await load();
    } catch (e) {
      notifyError(e.message || t.partnerTierSaveFailed);
    } finally {
      setSavingId(null);
    }
  };

  const createTier = async () => {
    setCreatingTier(true);
    try {
      await adminUpsertPartnerTier({
        slug: newSlug.trim().toLowerCase(),
        nameEn: newNameEn.trim() || newSlug,
        nameAr: newNameAr.trim() || newSlug,
        markupPercent: Number(newMarkup),
        isActive: true,
        sortOrder: (tiers.length + 1) * 10,
      });
      setNewSlug('');
      setNewNameEn('');
      setNewNameAr('');
      setNewMarkup('5');
      notifySuccess(t.partnerTierSaved);
      await load();
    } catch (e) {
      notifyError(e.message || t.partnerTierSaveFailed);
    } finally {
      setCreatingTier(false);
    }
  };

  const createInvite = async () => {
    if (!inviteTierId) return;
    setCreatingInvite(true);
    setLastInvitePath('');
    try {
      const inv = await adminCreatePartnerInvite({
        tierId: inviteTierId,
        minutes: Number(inviteMinutes) || 15,
        note: inviteNote,
      });
      const path = inv?.path || `/partner/join?token=${inv?.token}`;
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      setLastInvitePath(`${origin}${path}`);
      notifySuccess(t.partnerInviteCreated);
      await load();
    } catch (e) {
      notifyError(e.message || t.partnerInviteFailed);
    } finally {
      setCreatingInvite(false);
    }
  };

  const copyInvite = async () => {
    if (!lastInvitePath) return;
    try {
      await navigator.clipboard.writeText(lastInvitePath);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notifyError(t.copyFailed || 'Copy failed');
    }
  };

  const searchUsers = async () => {
    const q = assignQuery.trim();
    if (!q) {
      setAssignResults([]);
      return;
    }
    setAssignSearching(true);
    setSelectedUser(null);
    try {
      const { rows } = await fetchAdminUsers(q, 15, 0, {
        orderBy: 'created_at',
        balanceFilter: 'all',
        statusFilter: 'all',
      });
      setAssignResults(Array.isArray(rows) ? rows : []);
      if (!rows?.length) notifyError(t.partnerUserNotFound);
    } catch (e) {
      notifyError(e.message || t.partnerUserNotFound);
      setAssignResults([]);
    } finally {
      setAssignSearching(false);
    }
  };

  const assignUser = async () => {
    if (!selectedUser?.id) {
      notifyError(t.partnerPickUserFirst);
      return;
    }
    setAssigning(true);
    try {
      await adminSetUserPartnerTier(selectedUser.id, assignTierId || null);
      const label = getProfileAdminLabel(selectedUser, selectedUser.email || selectedUser.id);
      notifySuccess(
        formatMessage(t.partnerUserAssignedNamed || t.partnerUserAssigned, {
          user: label,
          tier: assignTierId
            ? formatPartnerTierLabel(tiers.find((x) => x.id === assignTierId), lang)
            : (t.partnerRemoveTier || '—'),
        }),
      );
      setSelectedUser(null);
      setAssignResults([]);
      setAssignQuery('');
    } catch (e) {
      notifyError(e.message || t.partnerUserAssignFailed);
    } finally {
      setAssigning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--text-muted)] gap-2">
        <Loader2 className="w-5 h-5 animate-spin" />
        {t.loadingAdminTab}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Handshake className="w-5 h-5 text-[var(--accent)]" />
            {t.partnersTab}
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl leading-relaxed">
            {t.partnersIntro}
          </p>
        </div>
        <button type="button" onClick={load} className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5">
          <RefreshCw className="w-4 h-4" />
          {t.refresh}
        </button>
      </div>

      {/* Pricing rule callout */}
      <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-4 py-3 text-sm text-[var(--text-sec)] leading-relaxed">
        {t.partnersPricingRule}
      </div>

      {/* Tiers */}
      <section className="card p-5 sm:p-6 space-y-4">
        <h3 className="font-bold text-lg">{t.partnerTiersTitle}</h3>
        <div className="space-y-3">
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              t={t}
              saving={savingId === tier.id}
              onSave={(patch) => saveTier(tier, patch)}
            />
          ))}
        </div>

        <div className="border-t border-[var(--border)] pt-4 mt-2">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            {t.partnerTierAdd}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <input
              className="profile-field-input text-sm"
              placeholder="slug (e.g. gold)"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              dir="ltr"
            />
            <input
              className="profile-field-input text-sm"
              placeholder={t.partnerNameEn}
              value={newNameEn}
              onChange={(e) => setNewNameEn(e.target.value)}
            />
            <input
              className="profile-field-input text-sm"
              placeholder={t.partnerNameAr}
              value={newNameAr}
              onChange={(e) => setNewNameAr(e.target.value)}
            />
            <input
              className="profile-field-input text-sm"
              type="number"
              min="0"
              step="0.1"
              placeholder={t.partnerMarkupPercent}
              value={newMarkup}
              onChange={(e) => setNewMarkup(e.target.value)}
              dir="ltr"
            />
            <button
              type="button"
              disabled={creatingTier || !newSlug.trim()}
              onClick={createTier}
              className="btn btn-primary text-sm py-2 disabled:opacity-50"
            >
              {creatingTier ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.partnerTierCreate}
            </button>
          </div>
        </div>
      </section>

      {/* Invite link */}
      <section className="card p-5 sm:p-6 space-y-4">
        <h3 className="font-bold text-lg flex items-center gap-2">
          <Link2 className="w-5 h-5 text-[var(--accent)]" />
          {t.partnerInviteTitle}
        </h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">{t.partnerInviteHelp}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs space-y-1">
            <span className="text-[var(--text-muted)]">{t.partnerInviteTier}</span>
            <select
              className="profile-field-input text-sm w-full"
              value={inviteTierId}
              onChange={(e) => setInviteTierId(e.target.value)}
            >
              {tiers.filter((x) => x.is_active).map((tier) => (
                <option key={tier.id} value={tier.id}>
                  {formatPartnerTierLabel(tier, lang)} (+{tier.markup_percent}%)
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs space-y-1">
            <span className="text-[var(--text-muted)]">{t.partnerInviteMinutes}</span>
            <input
              type="number"
              min={5}
              max={1440}
              className="profile-field-input text-sm w-full"
              value={inviteMinutes}
              onChange={(e) => setInviteMinutes(e.target.value)}
              dir="ltr"
            />
          </label>
          <label className="text-xs space-y-1">
            <span className="text-[var(--text-muted)]">{t.partnerInviteNote}</span>
            <input
              className="profile-field-input text-sm w-full"
              value={inviteNote}
              onChange={(e) => setInviteNote(e.target.value)}
              placeholder="Shop name…"
            />
          </label>
        </div>
        <button
          type="button"
          disabled={creatingInvite || !inviteTierId}
          onClick={createInvite}
          className="btn btn-primary inline-flex items-center gap-2 text-sm py-2.5 px-4 disabled:opacity-50"
        >
          {creatingInvite ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          {t.partnerInviteGenerate}
        </button>
        {lastInvitePath && (
          <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3">
            <code className="text-xs break-all flex-1 font-mono text-emerald-100" dir="ltr">
              {lastInvitePath}
            </code>
            <button type="button" onClick={copyInvite} className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1 shrink-0">
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? t.copied : t.copy}
            </button>
          </div>
        )}

        {invites.length > 0 && (
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs text-start">
              <thead className="text-[var(--text-muted)]">
                <tr className="border-b border-[var(--border)]">
                  <th className="py-2 pe-3 font-medium">{t.partnerInviteTier}</th>
                  <th className="py-2 pe-3 font-medium">{t.partnerInviteExpires}</th>
                  <th className="py-2 pe-3 font-medium">{t.partnerInviteStatus}</th>
                </tr>
              </thead>
              <tbody>
                {invites.map((inv) => {
                  const status = inv.used_at
                    ? t.partnerInviteStatusUsed
                    : t.partnerInviteStatusOpen;
                  return (
                    <tr key={inv.id} className="border-b border-[var(--border)]/60">
                      <td className="py-2 pe-3">
                        {formatPartnerTierLabel(inv.partner_tiers, lang)}
                        {inv.note ? ` · ${inv.note}` : ''}
                      </td>
                      <td className="py-2 pe-3 font-mono" dir="ltr">
                        {new Date(inv.expires_at).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US')}
                      </td>
                      <td className="py-2 pe-3">{status}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Manual assign — real admin user search */}
      <section className="card p-5 sm:p-6 space-y-4">
        <h3 className="font-bold text-lg">{t.partnerAssignTitle}</h3>
        <p className="text-xs text-[var(--text-muted)]">{t.partnerAssignHelp}</p>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            className="profile-field-input text-sm flex-1"
            placeholder={t.partnerSearchPlaceholder}
            value={assignQuery}
            onChange={(e) => setAssignQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                searchUsers();
              }
            }}
          />
          <button
            type="button"
            disabled={assignSearching || !assignQuery.trim()}
            onClick={searchUsers}
            className="btn btn-secondary text-sm py-2 px-4 disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            {assignSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {t.search || t.adminUsersSearch}
          </button>
        </div>

        {assignResults.length > 0 && (
          <ul className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)] max-h-56 overflow-y-auto">
            {assignResults.map((u) => {
              const active = selectedUser?.id === u.id;
              return (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedUser(u)}
                    className={`w-full text-start px-3 py-2.5 text-sm flex flex-wrap items-center justify-between gap-2 hover:bg-[var(--bg-elevated)] ${active ? 'bg-[var(--accent)]/12' : ''}`}
                  >
                    <span className="min-w-0">
                      <span className="font-semibold font-mono text-[var(--accent)]">
                        {formatProfileUsername(getProfileUsername(u)) || getProfileAdminLabel(u)}
                      </span>
                      {getProfileDisplayName(u) ? (
                        <span className="text-[var(--text-muted)] ms-2">{getProfileDisplayName(u)}</span>
                      ) : null}
                      {u.email ? (
                        <span className="block text-[11px] text-[var(--text-muted)] truncate">{u.email}</span>
                      ) : null}
                    </span>
                    <span className="font-mono text-xs text-[var(--text-sec)]" dir="ltr">
                      ${parseFloat(u.balance || 0).toFixed(2)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedUser && (
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm">
            {t.partnerSelectedUser}:{' '}
            <strong className="font-mono">
              {formatProfileUsername(getProfileUsername(selectedUser)) || selectedUser.email || selectedUser.id}
            </strong>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <select
            className="profile-field-input text-sm sm:w-64"
            value={assignTierId}
            onChange={(e) => setAssignTierId(e.target.value)}
          >
            <option value="">{t.partnerRemoveTier}</option>
            {tiers.filter((x) => x.is_active).map((tier) => (
              <option key={tier.id} value={tier.id}>
                {formatPartnerTierLabel(tier, lang)} (+{Number(tier.markup_percent)}%)
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={assigning || !selectedUser?.id}
            onClick={assignUser}
            className="btn btn-primary text-sm py-2 px-4 disabled:opacity-50"
          >
            {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : t.partnerAssignApply}
          </button>
        </div>
      </section>
    </div>
  );
}

function TierRow({ tier, t, saving, onSave }) {
  const [markup, setMarkup] = useState(String(tier.markup_percent));
  const [nameEn, setNameEn] = useState(tier.name_en || '');
  const [nameAr, setNameAr] = useState(tier.name_ar || '');
  const [active, setActive] = useState(!!tier.is_active);

  useEffect(() => {
    setMarkup(String(tier.markup_percent));
    setNameEn(tier.name_en || '');
    setNameAr(tier.name_ar || '');
    setActive(!!tier.is_active);
  }, [tier]);

  return (
    <div className="rounded-xl border border-[var(--border)] p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
      <div className="lg:col-span-2">
        <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">slug</div>
        <div className="font-mono text-sm font-semibold" dir="ltr">{tier.slug}</div>
      </div>
      <label className="lg:col-span-2 text-xs space-y-1">
        <span className="text-[var(--text-muted)]">{t.partnerNameEn}</span>
        <input className="profile-field-input text-sm w-full" value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
      </label>
      <label className="lg:col-span-2 text-xs space-y-1">
        <span className="text-[var(--text-muted)]">{t.partnerNameAr}</span>
        <input className="profile-field-input text-sm w-full" value={nameAr} onChange={(e) => setNameAr(e.target.value)} />
      </label>
      <label className="lg:col-span-2 text-xs space-y-1">
        <span className="text-[var(--text-muted)]">{t.partnerMarkupPercent}</span>
        <div className="flex items-center gap-1">
          <input
            type="number"
            min="0"
            step="0.1"
            className="profile-field-input text-sm w-full"
            value={markup}
            onChange={(e) => setMarkup(e.target.value)}
            dir="ltr"
          />
          <span className="text-[var(--text-muted)] text-sm">%</span>
        </div>
        <div className="text-[10px] text-[var(--text-muted)]" dir="ltr">
          {formatMessage(t.partnerPriceExample || 'cost + {pct}%', { pct: markup })}
        </div>
      </label>
      <label className="lg:col-span-2 text-xs flex items-center gap-2 pb-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>{t.partnerTierActive}</span>
      </label>
      <div className="lg:col-span-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => onSave({
            name_en: nameEn,
            name_ar: nameAr,
            markup_percent: Number(markup),
            is_active: active,
          })}
          className="btn btn-secondary w-full text-sm py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.save}
        </button>
      </div>
    </div>
  );
}
