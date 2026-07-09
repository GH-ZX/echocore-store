import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { fetchStoreSettings, saveStoreSettings } from '../../lib/storeSettings';
import {
  DEFAULT_HOME_LAYOUT,
  HOME_SECTION_TYPES,
  createHomeSection,
  normalizeHomeLayout,
} from '../../lib/homeLayout';

function SectionEditor({ section, games, offers, reviews = [], isAr, t = {}, onChange }) {
  const meta = HOME_SECTION_TYPES[section.type];

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--border)] pt-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {isAr ? 'العنوان (إنجليزي)' : 'Title (English)'}
          </label>
          <input
            type="text"
            value={section.title_en || ''}
            onChange={(e) => onChange({ ...section, title_en: e.target.value })}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {isAr ? 'العنوان (عربي)' : 'Title (Arabic)'}
          </label>
          <input
            type="text"
            value={section.title_ar || ''}
            onChange={(e) => onChange({ ...section, title_ar: e.target.value })}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
            dir="rtl"
          />
        </div>
      </div>

      {(section.type === 'sale_offers' || section.type === 'suggested_offers') && (
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {t.homeSectionCardLimit || (isAr ? 'عدد البطاقات' : 'Card limit')}
          </label>
          <input
            type="number"
            min={1}
            max={10}
            value={section.limit ?? 8}
            onChange={(e) => onChange({ ...section, limit: Number(e.target.value) || 8 })}
            className="w-28 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
          />
        </div>
      )}

      {section.type === 'game_picks' && (
        <div>
          <label className="text-xs text-[var(--text-muted)] block mb-1.5">
            {isAr ? 'اختر الألعاب' : 'Pick games'}
          </label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-1">
            {games.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-2">{isAr ? 'لا توجد ألعاب' : 'No games yet'}</p>
            ) : (
              games.map((game) => {
                const checked = (section.game_ids || []).includes(game.id);
                return (
                  <label key={game.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const ids = new Set(section.game_ids || []);
                        if (e.target.checked) ids.add(game.id);
                        else ids.delete(game.id);
                        onChange({ ...section, game_ids: [...ids] });
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
            {isAr ? 'اختر العروض' : 'Pick offers'}
          </label>
          <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-1">
            {offers.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] p-2">{isAr ? 'لا توجد عروض' : 'No offers yet'}</p>
            ) : (
              offers.map((offer) => {
                const checked = (section.offer_ids || []).includes(offer.id);
                return (
                  <label key={offer.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const ids = new Set(section.offer_ids || []);
                        if (e.target.checked) ids.add(offer.id);
                        else ids.delete(offer.id);
                        onChange({ ...section, offer_ids: [...ids] });
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
                value={section.limit ?? 8}
                onChange={(e) => onChange({ ...section, limit: Number(e.target.value) || 8 })}
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
                value={section.interval_seconds ?? 6}
                onChange={(e) => onChange({ ...section, interval_seconds: Number(e.target.value) || 6 })}
                className="w-28 bg-[var(--bg-primary)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm py-1">
            <input
              type="checkbox"
              checked={section.show_submit_form !== false}
              onChange={(e) => onChange({ ...section, show_submit_form: e.target.checked })}
              className="accent-[var(--accent)]"
            />
            <span>{t.reviewsShowSubmitForm}</span>
          </label>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {t.reviewsPickOptional}
            </label>
            <div className="max-h-40 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2 space-y-1">
              {reviews.filter((r) => r.status === 'approved').length === 0 ? (
                <p className="text-xs text-[var(--text-muted)] p-2">{t.reviewsEmptyApproved}</p>
              ) : (
                reviews.filter((r) => r.status === 'approved').map((review) => {
                  const checked = (section.review_ids || []).includes(review.id);
                  return (
                    <label key={review.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-[var(--bg-surface)] cursor-pointer text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          const ids = new Set(section.review_ids || []);
                          if (e.target.checked) ids.add(review.id);
                          else ids.delete(review.id);
                          onChange({ ...section, review_ids: [...ids] });
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
          {isAr ? meta.descriptionAr : meta.descriptionEn}
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
  const isAr = lang === 'ar';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sections, setSections] = useState(DEFAULT_HOME_LAYOUT);
  const [expandedId, setExpandedId] = useState(null);
  const [addType, setAddType] = useState('game_picks');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchStoreSettings();
      setSections(normalizeHomeLayout(data.home_layout));
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

  const updateSection = (id, nextSection) => {
    setSections((prev) => prev.map((section) => (section.id === id ? nextSection : section)));
  };

  const handleAddSection = () => {
    const meta = HOME_SECTION_TYPES[addType];
    if (meta?.singleton && sections.some((section) => section.type === addType)) {
      setError(isAr ? 'هذا القسم موجود بالفعل' : 'This section type already exists on the home page');
      return;
    }

    const created = createHomeSection(addType);
    if (!created) return;
    setSections((prev) => [...prev, created]);
    setExpandedId(created.id);
    setError('');
  };

  const handleReset = () => {
    setSections(DEFAULT_HOME_LAYOUT.map((section) => ({ ...section })));
    setExpandedId(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const current = await fetchStoreSettings();
      const layout = normalizeHomeLayout(sections);
      await saveStoreSettings({ ...current, home_layout: layout });
      setSections([...layout]);
      setSuccess(t.homeLayoutSaved || (isAr ? 'تم حفظ تخطيط الصفحة الرئيسية' : 'Home layout saved for all users'));
      onSaved?.(layout);
      setTimeout(() => setSuccess(''), 3000);
    } catch (err) {
      setError(err.message || (isAr ? 'فشل الحفظ' : 'Save failed'));
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
              {t.homeLayoutSettings || (isAr ? 'تخطيط الصفحة الرئيسية' : 'Home Page Layout')}
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
              {t.homeLayoutHelp || (isAr
                ? 'أضف أو احذف أو رتّب أقسام البطاقات في الصفحة الرئيسية كما تريد.'
                : 'Add, remove, and reorder card sections on the home page.')}
            </p>
          </div>
          {onPreviewHomepage && (
            <button
              type="button"
              onClick={onPreviewHomepage}
              className="btn btn-secondary inline-flex items-center gap-2 text-sm py-2.5 px-4"
            >
              <Eye className="w-4 h-4" strokeWidth={2} />
              {t.homePreviewAsUser || (isAr ? 'معاينة كزائر' : 'Preview as customer')}
            </button>
          )}
        </div>

        <div className="space-y-3 mb-6">
          {sections.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border)] p-6 text-center text-[var(--text-muted)] text-sm">
              {isAr ? 'لا توجد أقسام. أضف قسماً جديداً.' : 'No sections yet. Add one below.'}
            </div>
          ) : (
            sections.map((section, index) => {
              const meta = HOME_SECTION_TYPES[section.type];
              const expanded = expandedId === section.id;
              return (
                <div
                  key={section.id}
                  className={`rounded-xl border transition-all ${
                    section.enabled
                      ? 'border-[var(--border)] bg-[var(--bg-primary)]'
                      : 'border-[var(--border)]/70 bg-[var(--bg-primary)]/60 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2 p-3 sm:p-4">
                    <div className="flex flex-col items-center gap-0.5 flex-shrink-0 w-8">
                      <GripVertical className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="text-[10px] font-bold text-[var(--accent)] tabular-nums">
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm sm:text-base truncate">
                        {isAr ? (section.title_ar || meta?.labelAr) : (section.title_en || meta?.labelEn)}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">
                        {isAr ? meta?.labelAr : meta?.labelEn}
                        {!section.enabled && (
                          <span className="ml-2 text-[var(--warning)]">
                            {isAr ? '• مخفي' : '• Hidden'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => moveSection(index, -1)}
                        disabled={index === 0}
                        className="p-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/40 disabled:opacity-40"
                        aria-label={t.homeSectionMoveUp || (isAr ? 'تحريك لأعلى' : 'Move up')}
                        title={t.homeSectionMoveUp || (isAr ? 'تحريك لأعلى' : 'Move up')}
                      >
                        <ChevronUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveSection(index, 1)}
                        disabled={index === sections.length - 1}
                        className="p-2 rounded-lg border border-[var(--border)] hover:border-[var(--accent)]/40 disabled:opacity-40"
                        aria-label={t.homeSectionMoveDown || (isAr ? 'تحريك لأسفل' : 'Move down')}
                        title={t.homeSectionMoveDown || (isAr ? 'تحريك لأسفل' : 'Move down')}
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
                        {section.enabled ? (isAr ? 'ظاهر' : 'Visible') : (isAr ? 'مخفي' : 'Hidden')}
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : section.id)}
                        className="px-2.5 py-1.5 rounded-lg text-xs font-semibold border border-[var(--border)] hover:border-[var(--accent)]/35"
                      >
                        {expanded ? (isAr ? 'إغلاق' : 'Close') : (isAr ? 'تعديل' : 'Edit')}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeSection(section.id)}
                        className="p-2 rounded-lg border border-red-500/25 text-red-400 hover:bg-red-500/10"
                        aria-label="Remove section"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4">
                      <SectionEditor
                        section={section}
                        games={games}
                        offers={offers}
                        reviews={reviews}
                        isAr={isAr}
                        t={t}
                        onChange={(next) => updateSection(section.id, next)}
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-4">
          <div className="text-sm font-semibold mb-3">
            {t.addHomeSection || (isAr ? 'إضافة قسم بطاقات' : 'Add card section')}
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-xl px-3 py-2.5 text-sm outline-none min-w-[220px]"
            >
              {Object.entries(HOME_SECTION_TYPES).map(([type, meta]) => (
                <option key={type} value={type}>
                  {isAr ? meta.labelAr : meta.labelEn}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleAddSection} className="action-chip gap-2">
              <Plus className="w-4 h-4" />
              {t.addSection || (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-6 pt-4 border-t border-[var(--border)]">
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary action-chip gap-2 !border-0">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {t.saveHomeLayout || (isAr ? 'حفظ التخطيط للجميع' : 'Save Layout for Everyone')}
          </button>
          <button type="button" onClick={handleReset} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.resetHomeLayout || (isAr ? 'إعادة الافتراضي' : 'Reset to Default')}
          </button>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh || (isAr ? 'تحديث' : 'Refresh')}
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