import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  LayoutGrid,
  Loader2,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Save,
  Eye,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Images,
  Percent,
  Gamepad2,
  Gift,
  Star,
  Tags,
  Sparkles,
  MessageSquare,
  Share2,
  RotateCcw,
} from 'lucide-react';
import { getCarouselGames } from '../../lib/carouselUtils';
import {
  countActiveOffers,
  getCatalogVoucherGames,
  getVisibleTopupGames,
} from '../../lib/catalogUtils';
import { offerBelongsToStorefront } from '../../lib/gameRegions';
import { isValidSaleOffer } from '../../lib/saleOffers';
import { isDisplayableReview } from '../../lib/customerReviews';
import { formatMessage } from '../../lib/i18n';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_TYPES,
  HOME_SECTION_LIMIT_MAX,
  createHomeSection,
  evaluateHomeSectionStatus,
  fetchHomeLayout,
  getAddableHomeSectionTypes,
  normalizeHomeLayout,
  saveHomeLayoutToDatabase,
} from '../../lib/homeLayout';
import { fetchStoreSettings } from '../../lib/storeSettings';

const SECTION_TYPE_ICONS = {
  carousel: Images,
  sale_offers: Percent,
  games: Gamepad2,
  gift_cards: Gift,
  game_picks: Star,
  redeem_picks: Gift,
  offer_picks: Tags,
  suggested_offers: Sparkles,
  customer_reviews: MessageSquare,
  social_links: Share2,
};

function sectionsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function FieldLabel({ children }) {
  return <label className="text-xs font-semibold text-[var(--text-muted)] block mb-1">{children}</label>;
}

function TextInput({ className = '', ...props }) {
  return (
    <input
      {...props}
      className={`w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2 text-sm outline-none ${className}`}
    />
  );
}

/** Controlled section fields — parent holds the source of truth. */
function SectionFields({
  section,
  onChange,
  games = [],
  offers = [],
  reviews = [],
  lang = 'ar',
  t = {},
}) {
  const type = section.type;
  const set = (patch) => onChange({ ...section, ...patch });
  const meta = HOME_SECTION_TYPES[type];

  const gameList = useMemo(() => (Array.isArray(games) ? games : []), [games]);
  const offerList = useMemo(() => (Array.isArray(offers) ? offers.slice(0, 200) : []), [offers]);

  return (
    <div className="space-y-3 pt-3 border-t border-[var(--border)]">
      {type !== 'carousel' && (
        <div className="grid sm:grid-cols-2 gap-3">
          <div>
            <FieldLabel>{t.homeFieldTitleEnglish}</FieldLabel>
            <TextInput
              value={section.title_en || ''}
              onChange={(e) => set({ title_en: e.target.value })}
              maxLength={80}
            />
          </div>
          <div>
            <FieldLabel>{t.homeFieldTitleArabic}</FieldLabel>
            <TextInput
              value={section.title_ar || ''}
              onChange={(e) => set({ title_ar: e.target.value })}
              dir="rtl"
              maxLength={80}
            />
          </div>
        </div>
      )}

      {type === 'carousel' && (
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          {t.homeCarouselHelp}
        </p>
      )}

      {(type === 'sale_offers' || type === 'suggested_offers' || type === 'gift_cards') && (
        <div>
          <FieldLabel>{t.homeSectionCardLimit}</FieldLabel>
          <TextInput
            type="number"
            min={1}
            max={HOME_SECTION_LIMIT_MAX}
            className="!w-28"
            value={section.limit ?? 8}
            onChange={(e) => set({
              limit: Math.max(1, Math.min(HOME_SECTION_LIMIT_MAX, Number(e.target.value) || 8)),
            })}
          />
          <p className="text-[10px] text-[var(--text-muted)] mt-1">{t.homeSectionCardLimitHelp}</p>
        </div>
      )}

      {type === 'social_links' && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t.homeFieldSubtitleEnglish}</FieldLabel>
              <TextInput
                value={section.subtitle_en || ''}
                onChange={(e) => set({ subtitle_en: e.target.value })}
                maxLength={120}
              />
            </div>
            <div>
              <FieldLabel>{t.homeFieldSubtitleArabic}</FieldLabel>
              <TextInput
                value={section.subtitle_ar || ''}
                onChange={(e) => set({ subtitle_ar: e.target.value })}
                dir="rtl"
                maxLength={120}
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t.homeFieldButtonTextEnglish}</FieldLabel>
              <TextInput
                value={section.button_text_en || ''}
                onChange={(e) => set({ button_text_en: e.target.value })}
                maxLength={40}
              />
            </div>
            <div>
              <FieldLabel>{t.homeFieldButtonTextArabic}</FieldLabel>
              <TextInput
                value={section.button_text_ar || ''}
                onChange={(e) => set({ button_text_ar: e.target.value })}
                dir="rtl"
                maxLength={40}
              />
            </div>
          </div>
        </>
      )}

      {(type === 'game_picks' || type === 'redeem_picks') && (
        <PickList
          label={type === 'redeem_picks' ? (t.homePickRedeemCodes || t.homePickGames) : t.homePickGames}
          empty={t.homeNoGames}
          items={gameList.map((g) => ({
            id: g.id,
            label: g.name_en || g.name_ar || g.id,
          }))}
          selectedIds={section.game_ids || []}
          onChangeIds={(game_ids) => set({ game_ids })}
          t={t}
        />
      )}

      {type === 'offer_picks' && (
        <PickList
          label={t.homePickOffers}
          empty={t.homeNoOffers}
          items={offerList.map((o) => ({
            id: o.id,
            label: `${o.name_en || o.name_ar || o.id} — $${parseFloat(o.price || 0).toFixed(2)}`,
          }))}
          selectedIds={section.offer_ids || []}
          onChangeIds={(offer_ids) => set({ offer_ids })}
          t={t}
        />
      )}

      {type === 'customer_reviews' && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <FieldLabel>{t.reviewsSectionLimit}</FieldLabel>
              <TextInput
                type="number"
                min={1}
                max={20}
                className="!w-28"
                value={section.limit ?? 8}
                onChange={(e) => set({ limit: Number(e.target.value) || 8 })}
              />
            </div>
            <div>
              <FieldLabel>{t.reviewsIntervalSeconds}</FieldLabel>
              <TextInput
                type="number"
                min={3}
                max={30}
                className="!w-28"
                value={section.interval_seconds ?? 6}
                onChange={(e) => set({ interval_seconds: Number(e.target.value) || 6 })}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={section.show_submit_form !== false}
              onChange={(e) => set({ show_submit_form: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            {t.reviewsShowSubmitForm}
          </label>
          <PickList
            label={t.reviewsPickOptional}
            empty={t.reviewsEmptyApproved}
            help={t.reviewsPickHelp}
            items={reviews.filter(isDisplayableReview).map((r) => ({
              id: r.id,
              label: r.author_name || r.id,
            }))}
            selectedIds={section.review_ids || []}
            onChangeIds={(review_ids) => set({ review_ids })}
            t={t}
          />
        </>
      )}

      {meta && (
        <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
          {lang === 'ar' ? meta.descriptionAr : meta.descriptionEn}
        </p>
      )}
    </div>
  );
}

function PickList({
  label,
  empty,
  help,
  items = [],
  selectedIds = [],
  onChangeIds,
  t = {},
}) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return items;
    return items.filter((i) => String(i.label).toLowerCase().includes(q));
  }, [items, filter]);

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      {items.length > 8 && (
        <TextInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t.search || 'Search…'}
          className="mb-2"
        />
      )}
      <div className="max-h-44 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-0.5">
        {filtered.length === 0 ? (
          <p className="text-xs text-[var(--text-muted)] p-2">{empty}</p>
        ) : (
          filtered.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <label
                key={item.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const next = new Set(selectedIds);
                    if (e.target.checked) next.add(item.id);
                    else next.delete(item.id);
                    onChangeIds([...next]);
                  }}
                  className="accent-[var(--accent)]"
                />
                <span className="truncate">{item.label}</span>
              </label>
            );
          })
        )}
      </div>
      {help ? <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{help}</p> : null}
      {selectedIds.length > 0 && (
        <p className="text-[10px] text-[var(--accent)] mt-1">
          {formatMessage(t.homePickSelectedCount || '{count} selected', { count: selectedIds.length })}
        </p>
      )}
    </div>
  );
}

export default function AdminHomeLayoutSettings({
  t = {},
  lang = 'ar',
  games = [],
  offers = [],
  reviews = [],
  onSaved,
  onPreviewHomepage,
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sections, setSections] = useState(() => DEFAULT_HOME_LAYOUT.map((s) => ({ ...s })));
  const [savedSnapshot, setSavedSnapshot] = useState(() => DEFAULT_HOME_LAYOUT.map((s) => ({ ...s })));
  const [expandedId, setExpandedId] = useState(null);
  const [addType, setAddType] = useState('game_picks');

  const topupGames = useMemo(
    () => getVisibleTopupGames(games, offers, { isAdmin: true }),
    [games, offers],
  );
  const storefrontOffers = useMemo(
    () => offers.filter((o) => offerBelongsToStorefront(o, games) && o.active !== false),
    [offers, games],
  );
  const redeemGames = useMemo(
    () => getCatalogVoucherGames(games)
      .filter((g) => countActiveOffers(g.id, offers) > 0 || g.catalog_source === 'live' || g.active !== false),
    [games, offers],
  );

  const statusContext = useMemo(() => ({
    carouselCount: getCarouselGames(games).length,
    gamesCount: topupGames.length,
    voucherCount: redeemGames.length,
    giftCardCount: redeemGames.length,
    saleOfferCount: storefrontOffers.filter(isValidSaleOffer).length,
    offerCount: storefrontOffers.length,
    approvedReviewCount: reviews.filter(isDisplayableReview).length,
    games,
    offers: storefrontOffers,
    reviews,
  }), [games, topupGames, redeemGames, storefrontOffers, reviews]);

  const dirty = useMemo(
    () => !sectionsEqual(sections, savedSnapshot),
    [sections, savedSnapshot],
  );

  const addableTypes = useMemo(() => getAddableHomeSectionTypes(), []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      let layout = await fetchHomeLayout();
      if (!layout?.length) {
        const data = await fetchStoreSettings();
        layout = normalizeHomeLayout(data.home_layout);
      }
      setSections(layout.map((s) => ({ ...s })));
      setSavedSnapshot(layout.map((s) => ({ ...s })));
    } catch (err) {
      setError(err.message || t.saveFailed);
    } finally {
      setLoading(false);
    }
  }, [t.saveFailed]);

  useEffect(() => {
    load();
  }, [load]);

  const updateSection = (id, nextSection) => {
    setSections((prev) => prev.map((s) => (s.id === id ? nextSection : s)));
  };

  const moveSection = (index, dir) => {
    const to = index + dir;
    if (to < 0 || to >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(to, 0, row);
      return next;
    });
  };

  const toggleEnabled = (id) => {
    setSections((prev) => prev.map((s) => (
      s.id === id ? { ...s, enabled: !s.enabled } : s
    )));
  };

  const removeSection = (id) => {
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const handleAdd = () => {
    const meta = HOME_SECTION_TYPES[addType];
    if (!meta || meta.deprecated) return;
    if (meta.singleton && sections.some((s) => s.type === addType)) {
      setError(t.homeSectionAlreadyExists);
      return;
    }
    const created = createHomeSection(addType);
    if (!created) return;
    setSections((prev) => [...prev, created]);
    setExpandedId(created.id);
    setError('');
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const layout = await saveHomeLayoutToDatabase(sections);
      setSections(layout.map((s) => ({ ...s })));
      setSavedSnapshot(layout.map((s) => ({ ...s })));
      onSaved?.(layout);
      setSuccess(t.homeLayoutSaved);
      setTimeout(() => setSuccess(''), 3500);
    } catch (err) {
      setError(err.message || t.saveFailed || t.homeSectionSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleResetRecommended = () => {
    const defaults = DEFAULT_HOME_LAYOUT.map((s) => ({ ...s }));
    setSections(defaults);
    setExpandedId(null);
    setError('');
  };

  if (loading) {
    return (
      <div className="card p-10 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
              {t.homeLayoutSettings}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl leading-relaxed">
              {t.homeLayoutHelpV2}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {onPreviewHomepage && (
              <button
                type="button"
                onClick={onPreviewHomepage}
                className="btn btn-secondary text-sm gap-1.5 py-2 px-3"
              >
                <Eye className="w-4 h-4" />
                {t.homePreviewAsUser}
              </button>
            )}
            <button
              type="button"
              onClick={load}
              className="btn btn-secondary text-sm gap-1.5 py-2 px-3"
              title={t.refresh}
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ul className="text-xs text-[var(--text-muted)] space-y-1 list-disc ps-4 mb-4 leading-relaxed">
          <li>{t.homeLayoutBulletOrder}</li>
          <li>{t.homeLayoutBulletSave}</li>
          <li>{t.homeLayoutBulletCarousel}</li>
        </ul>

        {dirty && (
          <div className="mb-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-100 text-sm">
            {t.homeLayoutUnsaved}
          </div>
        )}
        {error && (
          <div className="mb-3 p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mb-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex gap-2">
            <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
            {success}
          </div>
        )}

        <div className="space-y-2">
          {sections.map((section, index) => {
            const meta = HOME_SECTION_TYPES[section.type];
            const TypeIcon = SECTION_TYPE_ICONS[section.type] || LayoutGrid;
            const status = evaluateHomeSectionStatus(section, statusContext);
            const expanded = expandedId === section.id;
            const title = lang === 'ar'
              ? (section.title_ar || meta?.labelAr || section.type)
              : (section.title_en || meta?.labelEn || section.type);

            const pickGames = section.type === 'redeem_picks' ? redeemGames : topupGames;

            return (
              <div
                key={section.id}
                className={`rounded-xl border transition-colors ${
                  section.enabled
                    ? 'border-[var(--border)] bg-[var(--bg-primary)]'
                    : 'border-[var(--border)]/60 opacity-75'
                }`}
              >
                <div className="flex items-center gap-2 p-2.5 sm:p-3">
                  <span className="text-[10px] font-mono text-[var(--accent)] w-5 text-center shrink-0">
                    {index + 1}
                  </span>
                  <div className="w-8 h-8 rounded-lg border border-[var(--border)] flex items-center justify-center shrink-0 bg-[var(--bg-surface)]">
                    <TypeIcon className="w-4 h-4 text-[var(--accent)]" />
                  </div>
                  <button
                    type="button"
                    className="flex-1 min-w-0 text-start"
                    onClick={() => setExpandedId(expanded ? null : section.id)}
                  >
                    <div className="font-semibold text-sm truncate">{title}</div>
                    <div className="text-[10px] text-[var(--text-muted)] flex flex-wrap gap-1.5 mt-0.5">
                      <span>{meta ? (lang === 'ar' ? meta.labelAr : meta.labelEn) : section.type}</span>
                      {!section.enabled && (
                        <span className="text-amber-300">{t.homeSectionBadgeHidden}</span>
                      )}
                      {status.empty && section.enabled && (
                        <span className="text-amber-200/80">{t.homeSectionBadgeEmpty}</span>
                      )}
                    </div>
                  </button>
                  <label className="flex items-center gap-1 text-[11px] text-[var(--text-sec)] shrink-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={section.enabled !== false}
                      onChange={() => toggleEnabled(section.id)}
                      className="accent-[var(--accent)]"
                    />
                    {t.homeSectionVisible || t.show || 'ON'}
                  </label>
                  <div className="flex flex-col shrink-0">
                    <button
                      type="button"
                      disabled={index === 0}
                      onClick={() => moveSection(index, -1)}
                      className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30"
                      aria-label={t.adminNavMoveUp || 'Up'}
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      disabled={index === sections.length - 1}
                      onClick={() => moveSection(index, 1)}
                      className="p-0.5 text-[var(--text-muted)] hover:text-[var(--accent)] disabled:opacity-30"
                      aria-label={t.adminNavMoveDown || 'Down'}
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                  </div>
                  {section.type !== 'carousel' && section.type !== 'games' && (
                    <button
                      type="button"
                      onClick={() => removeSection(section.id)}
                      className="p-1.5 text-red-400/80 hover:text-red-300 shrink-0"
                      title={t.delete}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {expanded && (
                  <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                    <SectionFields
                      section={section}
                      onChange={(next) => updateSection(section.id, next)}
                      games={pickGames}
                      offers={storefrontOffers}
                      reviews={reviews}
                      lang={lang}
                      t={t}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-4">
          <div className="flex-1 min-w-[10rem]">
            <FieldLabel>{t.homeAddSection}</FieldLabel>
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="input w-full text-sm !py-2"
            >
              {addableTypes.map((row) => (
                <option key={row.type} value={row.type}>
                  {lang === 'ar' ? row.labelAr : row.labelEn}
                </option>
              ))}
            </select>
          </div>
          <button type="button" onClick={handleAdd} className="btn btn-secondary gap-1.5 text-sm py-2">
            <Plus className="w-4 h-4" />
            {t.homeAddSectionBtn || t.add}
          </button>
          <button
            type="button"
            onClick={handleResetRecommended}
            className="btn btn-secondary gap-1.5 text-sm py-2"
            title={t.homeResetRecommended}
          >
            <RotateCcw className="w-4 h-4" />
            {t.homeResetRecommended}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn btn-primary gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.homeSaveToDatabase}
          </button>
        </div>
      </div>
    </div>
  );
}
