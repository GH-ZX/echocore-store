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
  GripVertical,
  Images,
  Percent,
  Gamepad2,
  Gift,
  UserCircle,
  Star,
  Tags,
  Sparkles,
  MessageSquare,
  Info,
  Share2,
} from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import { getCarouselGames } from '../../lib/carouselUtils';
import {
  countActiveOffers,
  getGiftCardGames,
  getGamingAccountGames,
  getVisibleTopupGames,
} from '../../lib/catalogUtils';
import { offerBelongsToStorefront } from '../../lib/gameRegions';
import { isDisplayableReview } from '../../lib/customerReviews';
import { formatMessage } from '../../lib/i18n';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_TYPES,
  createHomeSection,
  evaluateHomeSectionStatus,
  normalizeHomeLayout,
} from '../../lib/homeLayout';

const SECTION_TYPE_ICONS = {
  carousel: Images,
  sale_offers: Percent,
  games: Gamepad2,
  gift_cards: Gift,
  gaming_accounts: UserCircle,
  game_picks: Star,
  offer_picks: Tags,
  suggested_offers: Sparkles,
  customer_reviews: MessageSquare,
  social_links: Share2,
};

function sectionsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function SectionStatusBadges({ status, t = {} }) {
  if (!status.hidden && !status.empty) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-1">
      {status.hidden && (
        <span className="home-section-badge home-section-badge--hidden">
          {t.homeSectionBadgeHidden}
        </span>
      )}
      {status.empty && (
        <span className="home-section-badge home-section-badge--empty">
          {t.homeSectionBadgeEmpty}
        </span>
      )}
    </div>
  );
}

function SectionEditor({
  section,
  games,
  offers,
  reviews = [],
  lang,
  t = {},
  saving = false,
  onSave,
}) {
  const meta = HOME_SECTION_TYPES[section.type];
  const [draft, setDraft] = useState(section);
  const isDirty = !sectionsEqual(draft, section);

  useEffect(() => {
    setDraft(section);
  }, [section]);

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.homeFieldTitleEnglish}
          </label>
          <input
            type="text"
            value={draft.title_en || ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, title_en: e.target.value }))}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.homeFieldTitleArabic}
          </label>
          <input
            type="text"
            value={draft.title_ar || ''}
            onChange={(e) => setDraft((prev) => ({ ...prev, title_ar: e.target.value }))}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
            dir="rtl"
          />
        </div>
      </div>

      {section.type === 'social_links' && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                {t.homeFieldSubtitleEnglish}
              </label>
              <input
                type="text"
                value={draft.subtitle_en || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, subtitle_en: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                {t.homeFieldSubtitleArabic}
              </label>
              <input
                type="text"
                value={draft.subtitle_ar || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, subtitle_ar: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
                dir="rtl"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                {t.homeFieldButtonTextEnglish}
              </label>
              <input
                type="text"
                value={draft.button_text_en || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, button_text_en: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                {t.homeFieldButtonTextArabic}
              </label>
              <input
                type="text"
                value={draft.button_text_ar || ''}
                onChange={(e) => setDraft((prev) => ({ ...prev, button_text_ar: e.target.value }))}
                className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
                dir="rtl"
              />
            </div>
          </div>
        </>
      )}

      {(section.type === 'sale_offers' || section.type === 'suggested_offers' || section.type === 'gift_cards' || section.type === 'gaming_accounts') && (
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.homeSectionCardLimit}
          </label>
          <input
            type="number"
            min={1}
            max={(section.type === 'gift_cards' || section.type === 'gaming_accounts') ? 12 : 10}
            value={draft.limit ?? ((section.type === 'gift_cards' || section.type === 'gaming_accounts') ? 6 : 8)}
            onChange={(e) => setDraft((prev) => ({
              ...prev,
              limit: Number(e.target.value) || ((section.type === 'gift_cards' || section.type === 'gaming_accounts') ? 6 : 8),
            }))}
            className="w-28 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </div>
      )}

      {section.type === 'game_picks' && (
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.homePickGames}
          </label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-1">
            {games.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-2">{t.homeNoGames}</p>
            ) : (
              games.map((game) => {
                const checked = (draft.game_ids || []).includes(game.id);
                return (
                  <label key={game.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const ids = new Set(draft.game_ids || []);
                        if (e.target.checked) ids.add(game.id);
                        else ids.delete(game.id);
                        setDraft((prev) => ({ ...prev, game_ids: [...ids] }));
                      }}
                      className="accent-[var(--accent)]"
                    />
                    <span className="truncate">{game.name_en}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {section.type === 'offer_picks' && (
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.homePickOffers}
          </label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-1">
            {offers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-2">{t.homeNoOffers}</p>
            ) : (
              offers.map((offer) => {
                const checked = (draft.offer_ids || []).includes(offer.id);
                return (
                  <label key={offer.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const ids = new Set(draft.offer_ids || []);
                        if (e.target.checked) ids.add(offer.id);
                        else ids.delete(offer.id);
                        setDraft((prev) => ({ ...prev, offer_ids: [...ids] }));
                      }}
                      className="accent-[var(--accent)]"
                    />
                    <span className="truncate">{offer.name_en} — ${parseFloat(offer.price).toFixed(2)}</span>
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}

      {section.type === 'customer_reviews' && (
        <>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                {t.reviewsSectionLimit}
              </label>
              <input
                type="number"
                min={1}
                max={20}
                value={draft.limit ?? 8}
                onChange={(e) => setDraft((prev) => ({ ...prev, limit: Number(e.target.value) || 8 }))}
                className="w-28 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-[var(--text-muted)] block mb-1.5">
                {t.reviewsIntervalSeconds}
              </label>
              <input
                type="number"
                min={3}
                max={30}
                value={draft.interval_seconds ?? 6}
                onChange={(e) => setDraft((prev) => ({ ...prev, interval_seconds: Number(e.target.value) || 6 }))}
                className="w-28 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm py-1">
            <input
              type="checkbox"
              checked={draft.show_submit_form !== false}
              onChange={(e) => setDraft((prev) => ({ ...prev, show_submit_form: e.target.checked }))}
              className="accent-[var(--accent)]"
            />
            <span>{t.reviewsShowSubmitForm}</span>
          </label>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.reviewsPickOptional}
            </label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-1">
              {reviews.filter(isDisplayableReview).length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] p-2">{t.reviewsEmptyApproved}</p>
              ) : (
                reviews.filter(isDisplayableReview).map((review) => {
                  const checked = (draft.review_ids || []).includes(review.id);
                  return (
                    <label key={review.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const ids = new Set(draft.review_ids || []);
                          if (e.target.checked) ids.add(review.id);
                          else ids.delete(review.id);
                          setDraft((prev) => ({ ...prev, review_ids: [...ids] }));
                        }}
                        className="accent-[var(--accent)]"
                      />
                      <span className="truncate">{review.author_name}</span>
                    </label>
                  );
                })
              )}
            </div>
            <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.reviewsPickHelp}</p>
          </div>
        </>
      )}

      {meta && (
        <p className="text-[11px] text-[var(--text-muted)]">
          {lang === 'ar' ? meta.descriptionAr : meta.descriptionEn}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--border)]">
        <button
          type="button"
          onClick={() => onSave?.(draft)}
          disabled={saving || !isDirty}
          className="btn btn-primary action-chip gap-2 !border-0 text-sm disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t.saveHomeSection}
        </button>
        {isDirty && (
          <span className="text-xs text-[var(--warning)]">
            {t.homeSectionUnsaved}
          </span>
        )}
      </div>
    </div>
  );
}

function getSectionContentHint(type, counts, t) {
  switch (type) {
    case 'carousel':
      return formatMessage(t.homeHintCarousel, { count: counts.carouselCount });
    case 'games':
      return formatMessage(t.homeHintGames, { count: counts.gamesCount });
    case 'gift_cards':
      return formatMessage(t.homeHintGiftCards, { count: counts.giftCardCount });
    case 'gaming_accounts':
      return formatMessage(t.homeHintGamingAccounts, { count: counts.gamingAccountCount });
    case 'sale_offers':
      return formatMessage(t.homeHintSaleOffers, { count: counts.saleOfferCount });
    case 'suggested_offers':
    case 'offer_picks':
      return formatMessage(t.homeHintOffersAvailable, { count: counts.offerCount });
    case 'game_picks':
      return formatMessage(t.homeHintGamePicks, { count: counts.gamesCount });
    case 'customer_reviews':
      return formatMessage(t.homeHintReviews, { count: counts.approvedReviewCount });
    case 'social_links':
      return t.homeHintSocialLinks;
    default:
      return '';
  }
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
  const [savingSectionId, setSavingSectionId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sections, setSections] = useState(DEFAULT_HOME_LAYOUT);
  const [savedSections, setSavedSections] = useState(DEFAULT_HOME_LAYOUT);
  const [expandedId, setExpandedId] = useState(null);

  const topupGames = useMemo(
    () => getVisibleTopupGames(games, offers, { isAdmin: true }),
    [games, offers],
  );

  const storefrontOffers = useMemo(
    () => offers.filter((offer) => offerBelongsToStorefront(offer, games) && offer.active !== false),
    [offers, games],
  );

  const statusContext = useMemo(() => ({
    carouselCount: getCarouselGames(topupGames).length,
    gamesCount: topupGames.length,
    giftCardCount: getGiftCardGames(games)
      .filter((game) => countActiveOffers(game.id, offers) > 0 || game.catalog_source === 'live')
      .length,
    gamingAccountCount: getGamingAccountGames(games)
      .filter((game) => countActiveOffers(game.id, offers) > 0 || game.catalog_source === 'live')
      .length,
    saleOfferCount: storefrontOffers.filter((offer) => offer.is_sale).length,
    offerCount: storefrontOffers.length,
    approvedReviewCount: reviews.filter(isDisplayableReview).length,
    games,
    offers: storefrontOffers,
    reviews,
  }), [topupGames, games, offers, storefrontOffers, reviews]);

  const layoutDirty = useMemo(
    () => !sectionsEqual(sections, savedSections),
    [sections, savedSections],
  );

  const pickableGames = useMemo(
    () => topupGames.filter((game) => !game.parent_game_id),
    [topupGames],
  );

  const persistLayout = useCallback(async (nextSections, successMessage) => {
    const layout = normalizeHomeLayout(nextSections);
    const current = await fetchStoreSettings();
    await saveStoreSettings({ ...current, home_layout: layout });
    setSections([...layout]);
    setSavedSections([...layout]);
    onSaved?.(layout);
    setSuccess(successMessage);
    setTimeout(() => setSuccess(''), 3000);
    return layout;
  }, [onSaved]);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStoreSettings();
      const layout = normalizeHomeLayout(data.home_layout);
      setSections(layout);
      setSavedSections(layout);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const reorderSections = (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;
    if (fromIndex < 0 || toIndex < 0 || fromIndex >= sections.length || toIndex >= sections.length) return;
    setSections((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const moveSection = (index, direction) => {
    reorderSections(index, index + direction);
  };

  const removeSection = (id) => {
    setSections((prev) => prev.filter((section) => section.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const toggleEnabled = (id) => {
    setSections((prev) => prev.map((section) => (
      section.id === id ? { ...section, enabled: !section.enabled } : section
    )));
  };

  const handleAddSection = (type) => {
    const meta = HOME_SECTION_TYPES[type];
    if (!meta) return;
    if (meta.singleton && sections.some((section) => section.type === type)) {
      setError(t.homeSectionAlreadyExists);
      return;
    }

    const created = createHomeSection(type);
    if (!created) return;
    setSections((prev) => [...prev, created]);
    setExpandedId(created.id);
    setError('');
    setSuccess(t.homeSectionAdded);
    setTimeout(() => setSuccess(''), 4000);
  };

  const handleSaveSection = async (sectionId, draftSection) => {
    setSavingSectionId(sectionId);
    setError('');
    setSuccess('');
    try {
      const nextSections = sections.map((section) => (
        section.id === sectionId ? { ...section, ...draftSection, id: sectionId, type: section.type } : section
      ));
      await persistLayout(nextSections, t.homeSectionSaved);
    } catch (err) {
      setError(err.message || t.homeSectionSaveFailed);
    } finally {
      setSavingSectionId(null);
    }
  };

  const handleReset = () => {
    const defaults = DEFAULT_HOME_LAYOUT.map((section) => ({ ...section }));
    setSections(defaults);
    setExpandedId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await persistLayout(sections, t.homeLayoutSaved);
    } catch (err) {
      setError(err.message || t.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="card p-10 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <h2 className="text-xl font-black flex items-center gap-2">
              <LayoutGrid className="w-5 h-5 text-[var(--accent)]" />
              {t.homeLayoutSettings}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.homeLayoutHelp}
            </p>
          </div>
          {onPreviewHomepage && (
            <button
              type="button"
              onClick={onPreviewHomepage}
              className="btn btn-secondary inline-flex items-center gap-2 text-sm py-2.5 px-4"
            >
              <Eye className="w-4 h-4" strokeWidth={2} />
              {t.homePreviewAsUser}
            </button>
          )}
        </div>

        {layoutDirty && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-sm">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {t.homeLayoutUnsaved}
          </div>
        )}

        <div className="space-y-3 mb-6">
          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-[var(--text-muted)] text-sm">
              {t.homeNoSections}
            </div>
          ) : (
            sections.map((section, index) => {
              const meta = HOME_SECTION_TYPES[section.type];
              const expanded = expandedId === section.id;
              const status = evaluateHomeSectionStatus(section, statusContext);
              const TypeIcon = SECTION_TYPE_ICONS[section.type] || LayoutGrid;
              return (
                <div
                  key={section.id}
                  className={`rounded-xl border transition-all ${
                    section.enabled
                      ? 'border-[var(--border)] bg-[var(--bg-primary)]'
                      : 'border-[var(--border)]/70 bg-[var(--bg-primary)]/60 opacity-80'
                  }`}
                >
                  <div className="flex items-center gap-2 p-3 sm:p-4">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-8">
                      <GripVertical className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--accent)] tabular-nums">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--bg-surface)] border border-[var(--border)]">
                      <TypeIcon className="w-4 h-4 text-[var(--accent)]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm sm:text-base truncate">
                        {lang === 'ar' ? (section.title_ar || meta?.labelAr) : (section.title_en || meta?.labelEn)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] truncate">
                        {lang === 'ar' ? meta?.labelAr : meta?.labelEn}
                      </div>
                      <SectionStatusBadges status={status} t={t} />
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSection(index, -1)}
                        disabled={index === 0}
                        className="p-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/40 disabled:opacity-40"
                        aria-label={t.homeSectionMoveUp}
                        title={t.homeSectionMoveUp}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(index, 1)}
                        disabled={index === sections.length - 1}
                        className="p-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/40 disabled:opacity-40"
                        aria-label={t.homeSectionMoveDown}
                        title={t.homeSectionMoveDown}
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleEnabled(section.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
                          section.enabled
                            ? 'border-[var(--accent)]/35 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-muted)]'
                        }`}
                      >
                        {section.enabled ? t.homeSectionVisible : t.homeSectionHiddenToggle}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : section.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] hover:border-[var(--accent)]/35"
                      >
                        {expanded ? t.homeSectionClose : t.homeSectionEdit}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSection(section.id)}
                        className="p-2 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10"
                        aria-label={t.homeRemoveSection}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4">
                      <SectionEditor
                        section={section}
                        games={pickableGames}
                        offers={storefrontOffers}
                        reviews={reviews}
                        lang={lang}
                        t={t}
                        saving={savingSectionId === section.id}
                        onSave={(draft) => handleSaveSection(section.id, draft)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 sm:p-5">
          <div className="text-sm font-semibold mb-1">
            {t.addHomeSection}
          </div>
          <p className="text-xs text-[var(--text-muted)] mb-4 max-w-2xl">
            {t.addHomeSectionHelp}
          </p>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Object.entries(HOME_SECTION_TYPES).map(([type, meta]) => {
              const Icon = SECTION_TYPE_ICONS[type] || LayoutGrid;
              const alreadyAdded = meta.singleton && sections.some((section) => section.type === type);
              const hint = getSectionContentHint(type, statusContext, t);
              const disabled = alreadyAdded;

              return (
                <div
                  key={type}
                  className={`rounded-xl border p-4 transition-all ${
                    disabled
                      ? 'border-[var(--border)]/60 bg-[var(--bg-surface)]/40 opacity-60'
                      : 'border-[var(--border)] bg-[var(--bg-surface)] hover:border-[var(--accent)]/35'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--bg-primary)] border border-[var(--border)]">
                      <Icon className="w-5 h-5 text-[var(--accent)]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-sm">
                        {lang === 'ar' ? meta.labelAr : meta.labelEn}
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)] mt-1 leading-snug">
                        {lang === 'ar' ? meta.descriptionAr : meta.descriptionEn}
                      </p>
                      {hint && (
                        <p className="text-[10px] text-[var(--accent)]/80 mt-2 font-medium">
                          {hint}
                        </p>
                      )}
                      {meta.singleton && (
                        <span className="inline-block mt-2 text-[10px] uppercase tracking-wide text-[var(--text-muted)]">
                          {t.homeOnePerPage}
                        </span>
                      )}
                      {alreadyAdded && (
                        <span className="home-section-badge home-section-badge--added ml-0 mt-2">
                          {t.homeAlreadyAdded}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddSection(type)}
                    disabled={disabled}
                    className="mt-3 w-full action-chip gap-2 justify-center disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4" />
                    {t.addSection}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving || !layoutDirty} className="btn btn-primary action-chip gap-2 !border-0 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveHomeLayout}
          </button>
          <button type="button" onClick={handleReset} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.resetHomeLayout}
          </button>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-4 flex items-center gap-2 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-sm">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}
      </div>
    </div>
  );
}