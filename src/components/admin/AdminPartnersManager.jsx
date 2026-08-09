import { useCallback, useEffect, useState } from 'react';
import {
  Handshake,
  Layers,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Repeat,
  Save,
  Ticket,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import {
  adminDeletePartnerTier,
  adminListPartnerUsers,
  adminSetUserPartnerTier,
  adminUpsertPartnerTier,
  fetchPartnerTiers,
  formatPartnerTierLabel,
} from '../../lib/partners';
import {
  adminCreateInfluencerCoupon,
  adminListInfluencerCoupons,
  adminSetInfluencerCouponActive,
  adminUpdateInfluencerCoupon,
} from '../../lib/coupons';
import { fetchAdminUsers } from '../../lib/adminModeration';
import { formatMessage, formatMoney } from '../../lib/i18n';
import {
  formatProfileUsername,
  getProfileAdminLabel,
  getProfileDisplayName,
  getProfileUsername,
} from '../../lib/username';
import { useNotify } from '../../hooks/useNotify';
import { priceFromCost } from '../../lib/offerPricing';
import {
  resolveInfluencerCommissionPerUnit,
  resolveInfluencerUnitPrice,
} from '../../lib/partnerPricing';

export default function AdminPartnersManager({ t = {}, lang = 'ar', onNotify }) {
  const { notifyError, notifySuccess } = useNotify(onNotify);

  const [loading, setLoading] = useState(true);
  const [tiers, setTiers] = useState([]);
  const [coupons, setCoupons] = useState([]);
  const [partnerUsers, setPartnerUsers] = useState([]);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

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

  const [couponCode, setCouponCode] = useState('');
  const [couponBuyerMarkup, setCouponBuyerMarkup] = useState('10');
  const [couponInfMargin, setCouponInfMargin] = useState('3');
  const [couponNote, setCouponNote] = useState('');
  const [couponUserQuery, setCouponUserQuery] = useState('');
  const [couponUserResults, setCouponUserResults] = useState([]);
  const [couponUserSearching, setCouponUserSearching] = useState(false);
  const [couponInfluencer, setCouponInfluencer] = useState(null);
  const [creatingCoupon, setCreatingCoupon] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tList, cList, uList] = await Promise.all([
        fetchPartnerTiers(),
        adminListInfluencerCoupons(200).catch(() => []),
        adminListPartnerUsers().catch(() => []),
      ]);
      setTiers(tList);
      setCoupons(cList);
      setPartnerUsers(uList);
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

  const removeTier = async (tier) => {
    if (!window.confirm(formatMessage(t.partnerTierRemoveConfirm || 'Remove {slug}?', { slug: tier.slug }))) {
      return;
    }
    setDeletingId(tier.id);
    try {
      await adminDeletePartnerTier(tier.id);
      notifySuccess(t.partnerTierRemoved || t.partnerTierSaved);
      await load();
    } catch (e) {
      notifyError(e.message || t.partnerTierRemoveFailed);
    } finally {
      setDeletingId(null);
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

  const searchCouponInfluencer = async () => {
    const q = couponUserQuery.trim();
    if (!q) {
      setCouponUserResults([]);
      return;
    }
    setCouponUserSearching(true);
    setCouponInfluencer(null);
    try {
      const { rows } = await fetchAdminUsers(q, 12, 0, {
        orderBy: 'created_at',
        balanceFilter: 'all',
        statusFilter: 'all',
      });
      setCouponUserResults(Array.isArray(rows) ? rows : []);
      if (!rows?.length) notifyError(t.partnerUserNotFound);
    } catch (e) {
      notifyError(e.message || t.partnerUserNotFound);
      setCouponUserResults([]);
    } finally {
      setCouponUserSearching(false);
    }
  };

  const createCoupon = async () => {
    if (!couponInfluencer?.id) {
      notifyError(t.couponPickInfluencer);
      return;
    }
    setCreatingCoupon(true);
    try {
      await adminCreateInfluencerCoupon({
        code: couponCode,
        buyerMarkupPercent: Number(couponBuyerMarkup),
        influencerMarginPercent: Number(couponInfMargin),
        influencerUserId: couponInfluencer.id,
        note: couponNote,
      });
      setCouponCode('');
      setCouponBuyerMarkup('10');
      setCouponInfMargin('3');
      setCouponNote('');
      setCouponUserQuery('');
      setCouponUserResults([]);
      setCouponInfluencer(null);
      notifySuccess(t.couponCreated);
      await load();
    } catch (e) {
      notifyError(e.message || t.couponCreateFailed);
    } finally {
      setCreatingCoupon(false);
    }
  };

  const toggleCoupon = async (c) => {
    const active = c.isActive !== false && c.is_active !== false;
    try {
      await adminSetInfluencerCouponActive(c.id, !active);
      notifySuccess(active ? t.couponDeactivated : t.couponActivated);
      await load();
    } catch (e) {
      notifyError(e.message || t.couponCreateFailed);
    }
  };

  const activeTiers = tiers.filter((x) => x.is_active).length;
  const activeCoupons = coupons.filter((c) => c.isActive !== false && c.is_active !== false).length;
  const totalRedemptions = coupons.reduce((sum, c) => sum + Number(c.redemptionCount || 0), 0);
  const partnerUsersCount = partnerUsers.length;

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
      <header className="admin-apis-hero">
        <div className="admin-apis-hero__lead">
          <span className="admin-apis-hero__badge" aria-hidden>
            <Handshake className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <h2 className="admin-apis-hero__title">{t.partnersTab}</h2>
            <p className="admin-apis-hero__desc">{t.partnersIntro}</p>
          </div>
        </div>

        <div className="admin-partners-stats">
          <StatChip icon={Layers} value={activeTiers} label={t.partnerStatsTiers} />
          <StatChip icon={Ticket} value={activeCoupons} label={t.partnerStatsCoupons} />
          <StatChip icon={Users} value={partnerUsersCount} label={t.partnerStatsUsers} />
          <StatChip icon={Repeat} value={totalRedemptions} label={t.partnerStatsRedemptions} />
          <button
            type="button"
            onClick={load}
            className="admin-partners-refresh"
            aria-label={t.refresh}
            title={t.refresh}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <HowCard icon={Layers} title={t.partnerHowTiersTitle} desc={t.partnerHowTiersDesc} />
        <HowCard icon={Ticket} title={t.partnerHowCouponsTitle} desc={t.partnerHowCouponsDesc} />
        <HowCard icon={UserPlus} title={t.partnerHowAssignTitle} desc={t.partnerHowAssignDesc} />
      </div>

      <div className="rounded-xl border border-[var(--accent)]/25 bg-[var(--accent)]/8 px-4 py-3 text-sm text-[var(--text-sec)] leading-relaxed">
        {t.partnersPricingRule}
      </div>

      {/* Partner tiers */}
      <section className="card p-4 sm:p-6 space-y-4">
        <SectionHeader
          icon={Layers}
          title={t.partnerTiersTitle}
          note={t.partnerTiersDbNote}
          count={activeTiers}
        />
        {tiers.length === 0 ? (
          <EmptyState text={t.partnerTiersEmpty} />
        ) : (
          <div className="space-y-3">
            {tiers.map((tier) => (
              <TierRow
                key={tier.id}
                tier={tier}
                t={t}
                saving={savingId === tier.id}
                deleting={deletingId === tier.id}
                onSave={(patch) => saveTier(tier, patch)}
                onRemove={() => removeTier(tier)}
              />
            ))}
          </div>
        )}

        <div className="border-t border-[var(--border)] pt-4 mt-2">
          <h4 className="text-sm font-semibold mb-3 flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            {t.partnerTierAdd}
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <Field label={t.partnerSlugLabel} hint={t.partnerSlugHint}>
              <input
                className="profile-field-input text-sm w-full"
                placeholder="gold"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label={t.partnerNameEn}>
              <input
                className="profile-field-input text-sm w-full"
                value={newNameEn}
                onChange={(e) => setNewNameEn(e.target.value)}
              />
            </Field>
            <Field label={t.partnerNameAr}>
              <input
                className="profile-field-input text-sm w-full"
                value={newNameAr}
                onChange={(e) => setNewNameAr(e.target.value)}
              />
            </Field>
            <Field label={t.partnerMarkupPercent} hint={t.partnerMarkupHint}>
              <input
                className="profile-field-input text-sm w-full"
                type="number"
                min="0"
                step="0.1"
                value={newMarkup}
                onChange={(e) => setNewMarkup(e.target.value)}
                dir="ltr"
              />
            </Field>
            <div className="flex items-end">
              <button
                type="button"
                disabled={creatingTier || !newSlug.trim()}
                onClick={createTier}
                className="btn btn-primary text-sm py-2 w-full sm:w-auto disabled:opacity-50"
              >
                {creatingTier ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : t.partnerTierCreate}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Influencer referral coupons */}
      <section className="card p-4 sm:p-6 space-y-4">
        <SectionHeader
          icon={Ticket}
          title={t.couponAdminTitle}
          note={t.couponAdminHelp}
          count={coupons.length}
        />

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]/40 p-4 sm:p-5 space-y-4">
          <h4 className="text-sm font-semibold flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            {t.couponCreate}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t.couponCodeLabel} hint={t.couponCodeHint}>
              <input
                className="profile-field-input text-sm w-full font-mono"
                placeholder="YOUTUBER1"
                value={couponCode}
                onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                dir="ltr"
              />
            </Field>
            <Field label={t.couponNoteLabel} hint={t.couponNoteHint}>
              <input
                className="profile-field-input text-sm w-full"
                value={couponNote}
                onChange={(e) => setCouponNote(e.target.value)}
                placeholder={t.couponNotePlaceholder}
              />
            </Field>
            <Field label={t.couponBuyerMarkupLabel} hint={t.couponBuyerMarkupHint}>
              <input
                className="profile-field-input text-sm w-full"
                type="number"
                min="0"
                max="500"
                step="0.1"
                value={couponBuyerMarkup}
                onChange={(e) => setCouponBuyerMarkup(e.target.value)}
                dir="ltr"
              />
            </Field>
            <Field label={t.couponInfluencerMarginLabel} hint={t.couponInfluencerMarginHint}>
              <input
                className="profile-field-input text-sm w-full"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={couponInfMargin}
                onChange={(e) => setCouponInfMargin(e.target.value)}
                dir="ltr"
              />
            </Field>
          </div>
          <p className="text-[11px] text-[var(--text-muted)] leading-relaxed border border-[var(--border)] rounded-lg px-3 py-2">
            {t.couponExampleHelp}
          </p>

          <CouponMathPreview t={t} buyerMarkup={couponBuyerMarkup} infMargin={couponInfMargin} />

          <div className="space-y-2">
            <Field label={t.couponInfluencerLabel} hint={t.couponInfluencerHint}>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  className="profile-field-input text-sm flex-1"
                  placeholder={t.partnerSearchPlaceholder}
                  value={couponUserQuery}
                  onChange={(e) => setCouponUserQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      searchCouponInfluencer();
                    }
                  }}
                />
                <button
                  type="button"
                  disabled={couponUserSearching || !couponUserQuery.trim()}
                  onClick={searchCouponInfluencer}
                  className="btn btn-secondary text-sm py-2 px-4 disabled:opacity-50"
                >
                  {couponUserSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : (t.search || t.adminUsersSearch)}
                </button>
              </div>
            </Field>
            {couponUserResults.length > 0 && (
              <ul className="rounded-xl border border-[var(--border)] divide-y divide-[var(--border)] max-h-40 overflow-y-auto">
                {couponUserResults.map((u) => {
                  const active = couponInfluencer?.id === u.id;
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setCouponInfluencer(u)}
                        className={`w-full text-start px-3 py-2 text-sm hover:bg-[var(--bg-elevated)] ${active ? 'bg-[var(--accent)]/12' : ''}`}
                      >
                        <span className="font-mono font-semibold text-[var(--accent)]">
                          {formatProfileUsername(getProfileUsername(u)) || getProfileAdminLabel(u)}
                        </span>
                        {getProfileDisplayName(u) ? (
                          <span className="text-[var(--text-muted)] ms-2">{getProfileDisplayName(u)}</span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {couponInfluencer && (
              <div className="text-sm rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2">
                {t.couponSelectedInfluencer}:{' '}
                <strong className="font-mono">
                  {formatProfileUsername(getProfileUsername(couponInfluencer)) || couponInfluencer.email}
                </strong>
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={creatingCoupon || !couponCode.trim() || !couponInfluencer?.id}
            onClick={createCoupon}
            className="btn btn-primary text-sm py-2 px-4 w-full sm:w-auto inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {creatingCoupon ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {t.couponCreate}
          </button>
        </div>

        <div className="pt-1">
          <div className="flex items-center gap-2 mb-3">
            <Ticket className="w-4 h-4 text-[var(--accent)]" />
            <h4 className="text-sm font-semibold">{t.partnerCouponsListTitle}</h4>
            <span className="text-xs font-mono font-bold text-[var(--accent)] bg-[var(--accent)]/12 rounded-full px-2 py-0.5">
              {coupons.length}
            </span>
          </div>
          {coupons.length > 0 ? (
            <div className="space-y-2">
              {coupons.map((c) => (
                <CouponRow
                  key={c.id}
                  coupon={c}
                  t={t}
                  onToggle={() => toggleCoupon(c)}
                  onSaved={async (patch) => {
                    try {
                      await adminUpdateInfluencerCoupon(c.id, patch);
                      notifySuccess(t.couponUpdated);
                      await load();
                    } catch (e) {
                      notifyError(e.message || t.couponCreateFailed);
                    }
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState text={t.partnerCouponsEmpty} />
          )}
        </div>
      </section>

      {/* Manual partner assign */}
      <section className="card p-4 sm:p-6 space-y-4">
        <SectionHeader icon={UserPlus} title={t.partnerAssignTitle} note={t.partnerAssignHelp} />
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
            className="btn btn-secondary text-sm py-2 px-4 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
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
                      {formatMoney(u.balance || 0)}
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
            className="profile-field-input text-sm w-full sm:w-64"
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
            className="btn btn-primary text-sm py-2 px-4 w-full sm:w-auto disabled:opacity-50"
          >
            {assigning ? <Loader2 className="w-4 h-4 animate-spin" /> : t.partnerAssignApply}
          </button>
        </div>
      </section>
    </div>
  );
}

function Field({ label, hint, className = '', children }) {
  return (
    <label className={`text-xs space-y-1 block ${className}`}>
      <span className="font-semibold text-[var(--text-sec)]">{label}</span>
      {hint ? <span className="block text-[10px] text-[var(--text-muted)] leading-snug">{hint}</span> : null}
      {children}
    </label>
  );
}

function StatChip({ icon: Icon, value, label }) {
  return (
    <div className="admin-partners-stat">
      <span className="admin-partners-stat__top">
        <Icon className="admin-partners-stat__icon w-3.5 h-3.5" />
        {label}
      </span>
      <span className="admin-partners-stat__num" dir="ltr">{value}</span>
    </div>
  );
}

function HowCard({ icon: Icon, title, desc }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-4 flex items-start gap-3">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0">
        <h4 className="text-sm font-bold text-[var(--text-primary)] leading-tight">{title}</h4>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, note, count }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--accent)]/12 text-[var(--accent)] shrink-0">
        <Icon className="w-4 h-4" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="font-bold text-base sm:text-lg leading-tight">{title}</h3>
        {note ? <p className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{note}</p> : null}
      </div>
      {count != null ? (
        <span className="text-xs font-mono font-bold text-[var(--accent)] bg-[var(--accent)]/12 rounded-full px-2.5 py-1 shrink-0" dir="ltr">
          {count}
        </span>
      ) : null}
    </div>
  );
}

function EmptyState({ text }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--border)] px-4 py-6 text-center text-sm text-[var(--text-muted)] leading-relaxed">
      {text}
    </div>
  );
}

function TierRow({ tier, t, saving, deleting, onSave, onRemove }) {
  const [editing, setEditing] = useState(false);
  const [markup, setMarkup] = useState(String(tier.markup_percent));
  const [nameEn, setNameEn] = useState(tier.name_en || '');
  const [nameAr, setNameAr] = useState(tier.name_ar || '');
  const [active, setActive] = useState(!!tier.is_active);

  useEffect(() => {
    setMarkup(String(tier.markup_percent));
    setNameEn(tier.name_en || '');
    setNameAr(tier.name_ar || '');
    setActive(!!tier.is_active);
    setEditing(false);
  }, [tier]);

  const cancelEdit = () => {
    setMarkup(String(tier.markup_percent));
    setNameEn(tier.name_en || '');
    setNameAr(tier.name_ar || '');
    setActive(!!tier.is_active);
    setEditing(false);
  };

  if (!editing) {
    return (
      <div className={`rounded-xl border border-[var(--border)] p-3 sm:p-4 flex flex-wrap items-center gap-3 justify-between ${!tier.is_active ? 'opacity-60' : ''}`}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg bg-[var(--accent)]/12 px-2 py-0.5 text-xs font-bold text-[var(--accent)] font-mono" dir="ltr">
              +{tier.markup_percent}%
            </span>
            <span className="font-mono text-sm font-bold" dir="ltr">{tier.slug}</span>
            {!tier.is_active && (
              <span className="text-[10px] uppercase tracking-wide text-amber-300/90">{t.couponInactiveShort}</span>
            )}
          </div>
          <div className="text-sm">
            <span className="font-semibold">{tier.name_ar || tier.name_en}</span>
            {tier.name_en && tier.name_ar && tier.name_en !== tier.name_ar ? (
              <span className="text-[var(--text-muted)] ms-2">/ {tier.name_en}</span>
            ) : null}
          </div>
          <div className="text-xs text-[var(--text-muted)] font-mono" dir="ltr">
            {formatMessage(t.partnerPriceExample || 'cost + {pct}%', {
              pct: tier.markup_percent,
              result: priceFromCost(1, Number(tier.markup_percent)).toFixed(2),
            })}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t.edit || t.partnerTierEdit}
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onRemove}
            className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5 text-red-300 border-red-500/30 hover:bg-red-500/10 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
            {t.remove || t.partnerTierRemove}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-3 sm:p-4 grid grid-cols-1 lg:grid-cols-12 gap-2 items-end">
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
        <input
          type="number"
          min="0"
          step="0.1"
          className="profile-field-input text-sm w-full"
          value={markup}
          onChange={(e) => setMarkup(e.target.value)}
          dir="ltr"
        />
      </label>
      <label className="lg:col-span-1 text-xs flex items-center gap-2 pb-2">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        <span>{t.partnerTierActive}</span>
      </label>
      <div className="lg:col-span-3 flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            await onSave({
              name_en: nameEn,
              name_ar: nameAr,
              markup_percent: Number(markup),
              is_active: active,
            });
            setEditing(false);
          }}
          className="btn btn-primary flex-1 text-sm py-2 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.save}
        </button>
        <button type="button" disabled={saving} onClick={cancelEdit} className="btn btn-secondary text-sm py-2 px-3">
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function CouponRow({ coupon, t, onToggle, onSaved }) {
  const [editing, setEditing] = useState(false);
  const buyerDefault = coupon.buyerMarkupPercent ?? coupon.buyer_markup_percent ?? 10;
  const infDefault = coupon.influencerMarginPercent ?? coupon.influencer_margin_percent ?? 3;
  const [buyerMarkup, setBuyerMarkup] = useState(String(buyerDefault));
  const [infMargin, setInfMargin] = useState(String(infDefault));
  const [note, setNote] = useState(coupon.note || '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setBuyerMarkup(String(coupon.buyerMarkupPercent ?? coupon.buyer_markup_percent ?? 10));
    setInfMargin(String(coupon.influencerMarginPercent ?? coupon.influencer_margin_percent ?? 3));
    setNote(coupon.note || '');
    setEditing(false);
  }, [coupon]);

  const influencerLabel = coupon.influencerUsername || coupon.influencer_username
    ? `@${coupon.influencerUsername || coupon.influencer_username}`
    : (coupon.influencerName || coupon.influencer_name || coupon.influencerUserId || coupon.influencer_user_id || '—');

  if (!editing) {
    return (
      <div className={`rounded-xl border border-[var(--border)] p-3 flex flex-wrap items-center justify-between gap-3 ${(coupon.isActive !== false && coupon.is_active !== false) ? '' : 'opacity-60'}`}>
        <div className="min-w-0 space-y-0.5">
          <div className="font-mono font-bold text-sm" dir="ltr">{coupon.code}</div>
          <div className="text-xs text-[var(--text-sec)]">
            {formatMessage(t.couponRowSummary, {
              buyer: coupon.buyerMarkupPercent ?? coupon.buyer_markup_percent,
              margin: coupon.influencerMarginPercent ?? coupon.influencer_margin_percent,
              user: influencerLabel,
            })}
          </div>
          {coupon.note ? (
            <div className="text-[11px] text-[var(--text-muted)]">{coupon.note}</div>
          ) : null}
          <div className="text-[10px] text-[var(--text-muted)] font-mono" dir="ltr">
            {formatMessage(t.couponOrdersCount, {
              count: coupon.redemptionCount ?? coupon.redemption_count ?? 0,
            })}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="btn btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5"
          >
            <Pencil className="w-3.5 h-3.5" />
            {t.edit}
          </button>
          <button type="button" onClick={onToggle} className="btn btn-secondary text-[11px] py-1.5 px-2">
            {(coupon.isActive !== false && coupon.is_active !== false) ? t.couponDeactivate : t.couponActivate}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-3 space-y-3">
      <div className="font-mono font-bold text-sm" dir="ltr">{coupon.code}</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <Field label={t.couponBuyerMarkupLabel} hint={t.couponBuyerMarkupHint}>
          <input
            type="number"
            min="0"
            max="500"
            step="0.1"
            className="profile-field-input text-sm w-full"
            value={buyerMarkup}
            onChange={(e) => setBuyerMarkup(e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t.couponInfluencerMarginLabel} hint={t.couponInfluencerMarginHint}>
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            className="profile-field-input text-sm w-full"
            value={infMargin}
            onChange={(e) => setInfMargin(e.target.value)}
            dir="ltr"
          />
        </Field>
        <Field label={t.couponNoteLabel} className="sm:col-span-2">
          <input
            className="profile-field-input text-sm w-full"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await onSaved({
                buyerMarkupPercent: Number(buyerMarkup),
                influencerMarginPercent: Number(infMargin),
                note,
              });
              setEditing(false);
            } finally {
              setSaving(false);
            }
          }}
          className="btn btn-primary text-sm py-2 px-4 inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.save}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => {
            setBuyerMarkup(String(buyerDefault));
            setInfMargin(String(infDefault));
            setNote(coupon.note || '');
            setEditing(false);
          }}
          className="btn btn-secondary text-sm py-2 px-3"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

const MATH_BASE = { price: 1.12, g2bulk_cost_usd: 1.0 };

function CouponMathPreview({ t, buyerMarkup, infMargin }) {
  const buyerPct = Number(buyerMarkup);
  const infPct = Number(infMargin);
  const valid = Number.isFinite(buyerPct) && Number.isFinite(infPct);

  const buyer = valid ? resolveInfluencerUnitPrice(MATH_BASE, buyerPct) : null;
  const commission = valid ? resolveInfluencerCommissionPerUnit(MATH_BASE, buyer, infPct) : null;
  const store = buyer != null && commission != null
    ? Math.max(0, buyer - MATH_BASE.g2bulk_cost_usd - commission)
    : null;
  const fmt = (v) => (v == null ? '—' : `$${v.toFixed(2)}`);

  const zeroNote =
    valid &&
    commission === 0 &&
    infPct > 0 &&
    buyer != null &&
    buyer - MATH_BASE.g2bulk_cost_usd > 0.005;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-4 py-3 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          {t.couponMathPreviewTitle}
        </span>
        <span className="text-[10px] font-mono text-[var(--text-muted)]" dir="ltr">
          {t.couponMathPreviewAssumes}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <MathCell label={t.couponMathPreviewBuyer} value={fmt(buyer)} />
        <MathCell
          label={t.couponMathPreviewInfluencer}
          value={fmt(commission)}
          tone={commission != null && commission > 0 ? 'emerald' : 'muted'}
        />
        <MathCell label={t.couponMathPreviewStore} value={fmt(store)} tone="accent" />
      </div>
      {zeroNote && (
        <p className="text-[11px] text-amber-300/90 leading-relaxed">{t.couponMathPreviewZeroNote}</p>
      )}
    </div>
  );
}

function MathCell({ label, value, tone = 'muted' }) {
  const color =
    tone === 'emerald'
      ? 'text-emerald-400'
      : tone === 'accent'
        ? 'text-[var(--accent)]'
        : 'text-[var(--text-primary)]';
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 min-w-0">
      <span className="block text-[10px] text-[var(--text-muted)] truncate">{label}</span>
      <span className={`block font-mono font-bold tabular-nums ${color}`} dir="ltr">{value}</span>
    </div>
  );
}
