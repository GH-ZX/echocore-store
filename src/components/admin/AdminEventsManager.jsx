import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, CalendarClock, Eye, Loader2, PartyPopper, Play, Plus, RotateCcw, Save, Square, Trash2, Upload, X,
} from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import { fetchStoreMarkupPercent } from '../../lib/adminOfferPricing';
import { formatDateTime, formatMessage } from '../../lib/i18n';
import { uploadImage } from '../../lib/uploadImage';
import {
  DEFAULT_EVENT_OPTIONS,
  EVENT_DECORS,
  EVENT_LOOKS,
  deleteAdminEvent,
  endAdminEvent,
  eventErrorMessage,
  eventText,
  fetchAdminEvents,
  getEventOptions,
  saveAdminEvent,
  setEventPreview,
  slugifyEvent,
  startAdminEvent,
} from '../../lib/storeEvents';

const DECOR_LABEL = {
  balloons: 'eventDecorBalloons',
  confetti: 'eventDecorConfetti',
  stars: 'eventDecorStars',
  snow: 'eventDecorSnow',
  none: 'eventDecorNone',
};

const STATUS_LABEL = {
  draft: 'eventStatusDraft',
  scheduled: 'eventStatusScheduled',
  active: 'eventStatusActive',
  ended: 'eventStatusEnded',
};

const BEST_SELLER_DAYS = 60;

function newEvent() {
  return {
    id: null,
    status: 'draft',
    slug: '',
    title_ar: '',
    title_en: '',
    description_ar: '',
    description_en: '',
    note_ar: '',
    note_en: '',
    badge_ar: '',
    badge_en: '',
    look: 'celebration',
    theme: {},
    options: { ...DEFAULT_EVENT_OPTIONS },
    banner_image_url: '',
    markup_percent: '',
    include_fixed: true,
    starts_at: null,
    ends_at: null,
  };
}

/** ISO timestamp ⇄ the value of an <input type="datetime-local"> (browser local time). */
function toLocalInput(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function Field({ label, help, children, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-[11px] font-semibold text-[var(--text-sec)] mb-1">{label}</span>
      {children}
      {help && <span className="block text-[10px] text-[var(--text-muted)] mt-1 leading-relaxed">{help}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {children}
    </label>
  );
}

export default function AdminEventsManager({ t = {}, lang = 'ar', games = [], orders = [], onNotify, onPricesChanged }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(null);
  const [slugTouched, setSlugTouched] = useState(false);
  const [bannerFile, setBannerFile] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(null); // { kind: 'start' | 'end' | 'delete' }
  const [storeMarkup, setStoreMarkup] = useState(null);

  const load = useCallback(async () => {
    try {
      setEvents(await fetchAdminEvents());
    } catch (err) {
      onNotify?.(eventErrorMessage(err, t), 'error');
    } finally {
      setLoading(false);
    }
  }, [onNotify, t]);

  useEffect(() => {
    load();
    fetchStoreMarkupPercent().then(setStoreMarkup);
    return () => setEventPreview(null);
  }, [load]);

  const running = form?.status === 'active';
  const ended = form?.status === 'ended';
  const options = getEventOptions(form);
  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const setOption = (patch) => setForm((prev) => ({ ...prev, options: { ...getEventOptions(prev), ...patch } }));

  const openEvent = (event) => {
    setError('');
    setBannerFile(null);
    setSlugTouched(!!event.id);
    setForm({
      ...newEvent(),
      ...event,
      markup_percent: event.markup_percent ?? '',
      banner_image_url: event.banner_image_url || '',
      options: getEventOptions(event),
    });
  };

  // The store margin that prices return to: while this event runs, the settings value is the event's own.
  const baseMarkup = running && form?.saved_markup_percent != null ? Number(form.saved_markup_percent) : storeMarkup;
  const markupNumber = form?.markup_percent === '' || form?.markup_percent == null ? null : Number(form.markup_percent);

  const gameBySlug = useMemo(() => new Map(games.map((g) => [g.slug, g])), [games]);
  const gameName = (slug) => {
    const game = gameBySlug.get(slug);
    return game ? ((lang === 'ar' ? game.name_ar : game.name_en) || game.name_en || slug) : slug;
  };

  // Games by units sold in completed orders over the last 60 days (computed on click).
  const bestSellerSlugs = () => {
    const since = Date.now() - BEST_SELLER_DAYS * 24 * 60 * 60 * 1000;
    const counts = new Map();
    for (const order of orders) {
      if (order.status !== 'completed' || new Date(order.created_at).getTime() < since) continue;
      for (const item of order.order_items || []) {
        const slug = item.offers?.games?.slug;
        if (slug && gameBySlug.has(slug)) counts.set(slug, (counts.get(slug) || 0) + (Number(item.quantity) || 1));
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([slug]) => slug);
  };

  const moveSlug = (index, delta) => {
    const next = [...options.carouselSlugs];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOption({ carouselSlugs: next });
  };

  const persist = async (overrides = {}) => {
    if (!String(form.title_ar || '').trim() && !String(form.title_en || '').trim()) {
      throw new Error(t.eventNeedsTitle);
    }
    let bannerUrl = String(form.banner_image_url || '').trim();
    if (bannerFile) bannerUrl = await uploadImage(bannerFile, 'event-banner');
    const saved = await saveAdminEvent({ ...form, ...overrides, banner_image_url: bannerUrl });
    setBannerFile(null);
    setEvents((prev) => (prev.some((e) => e.id === saved.id)
      ? prev.map((e) => (e.id === saved.id ? saved : e))
      : [saved, ...prev]));
    openEvent(saved);
    return saved;
  };

  const run = async (label, action) => {
    setBusy(label);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(eventErrorMessage(err, t));
    } finally {
      setBusy('');
    }
  };

  const handleSave = () => run('save', async () => {
    await persist();
    onNotify?.(t.eventSaved, 'success');
  });

  const handleSchedule = (scheduled) => run('schedule', async () => {
    if (scheduled && !form.starts_at) throw new Error(t.eventScheduleNeedsStart);
    await persist({ status: scheduled ? 'scheduled' : 'draft' });
    onNotify?.(t.eventSaved, 'success');
  });

  const handleReuse = () => run('reuse', async () => {
    await persist({ status: 'draft', starts_at: null, ends_at: null });
    onNotify?.(t.eventSaved, 'success');
  });

  const handleStart = () => run('start', async () => {
    const saved = await persist();
    const result = await startAdminEvent(saved.id);
    const lowered = Number(result?.summary?.activeLowered) || 0;
    onNotify?.(lowered > 0 ? formatMessage(t.eventStartedPrices, { count: lowered }) : t.eventStarted, 'success');
    setEventPreview(null);
    const fresh = await fetchAdminEvents();
    setEvents(fresh);
    openEvent(fresh.find((e) => e.id === saved.id) || saved);
    fetchStoreMarkupPercent().then(setStoreMarkup);
    await onPricesChanged?.();
  });

  const handleEnd = () => run('end', async () => {
    await endAdminEvent(form.id);
    onNotify?.(t.eventEndedMsg, 'success');
    const fresh = await fetchAdminEvents();
    setEvents(fresh);
    openEvent(fresh.find((e) => e.id === form.id) || form);
    fetchStoreMarkupPercent().then(setStoreMarkup);
    await onPricesChanged?.();
  });

  const handleDelete = () => run('delete', async () => {
    await deleteAdminEvent(form.id);
    setEvents((prev) => prev.filter((e) => e.id !== form.id));
    setForm(null);
    onNotify?.(t.eventDeleted, 'success');
  });

  const title = form ? (eventText(form, lang, 'title') || t.eventNew) : '';
  const confirmCopy = confirm && {
    start: {
      title: t.eventStartNow,
      message: [
        formatMessage(t.eventStartConfirm, { title }),
        markupNumber != null && baseMarkup != null && markupNumber < baseMarkup
          ? formatMessage(t.eventStartConfirmPrices, { markup: markupNumber, current: baseMarkup })
          : '',
      ].filter(Boolean).join(' '),
      variant: 'primary',
      action: handleStart,
    },
    end: {
      title: t.eventEndNow,
      message: formatMessage(t.eventEndConfirm, { title }),
      variant: 'danger',
      action: handleEnd,
    },
    delete: {
      title: t.eventDelete,
      message: formatMessage(t.eventDeleteConfirm, { title }),
      variant: 'danger',
      action: handleDelete,
    },
  }[confirm.kind];

  const summary = form?.price_summary;

  return (
    <div className="card p-4 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-bold text-lg sm:text-xl flex items-center gap-2">
            <PartyPopper className="w-5 h-5 text-[var(--accent)]" />
            {t.adminEventsTitle}
          </h3>
          <p className="text-xs sm:text-sm text-[var(--text-sec)] mt-1 max-w-2xl leading-relaxed">{t.adminEventsDesc}</p>
        </div>
        <button type="button" className="btn btn-primary inline-flex items-center gap-1.5" onClick={() => openEvent(newEvent())}>
          <Plus className="w-4 h-4" />
          {t.eventNew}
        </button>
      </div>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-[var(--text-muted)]" />
      ) : events.length === 0 && !form ? (
        <p className="text-sm text-[var(--text-sec)]">{t.adminEventsEmpty}</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => openEvent(event)}
              className={`event-look text-start ${form?.id === event.id ? 'event-look--active' : ''}`}
            >
              <div
                className="event-look__art"
                style={{ backgroundImage: `url(${event.banner_image_url || (EVENT_LOOKS[event.look] || EVENT_LOOKS.celebration).art})` }}
                aria-hidden="true"
              />
              <div className="event-look__label">
                <span className="truncate">{eventText(event, lang, 'title')}</span>
                <span className={`event-chip event-chip--${event.status}`}>{t[STATUS_LABEL[event.status]]}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {form && (
        <form
          className="space-y-6 border-t border-[var(--border)] pt-5"
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
          onSubmit={(e) => { e.preventDefault(); handleSave(); }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-bold flex items-center gap-2">
              {title}
              <span className={`event-chip event-chip--${form.status}`}>{t[STATUS_LABEL[form.status]]}</span>
            </h4>
            <button type="button" className="p-2 rounded-lg hover:bg-white/5" aria-label={t.close} onClick={() => setForm(null)}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {running && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs leading-relaxed space-y-1">
              <p>{t.eventRunningNote}</p>
              {summary?.activeLowered > 0 && (
                <p className="font-semibold">
                  {formatMessage(t.eventSummary, { count: summary.activeLowered, avg: summary.avgPercentOff, max: summary.maxPercentOff })}
                </p>
              )}
              {form.ends_at && <p className="text-[var(--text-muted)]">{t.eventEndsAt}: {formatDateTime(form.ends_at, lang)}</p>}
            </div>
          )}

          <section className="space-y-3">
            <h5 className="text-sm font-bold text-[var(--accent)]">{t.eventTextSection}</h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.eventTitleAr}>
                <input className="input w-full" dir="rtl" maxLength={120} value={form.title_ar}
                  onChange={(e) => set({ title_ar: e.target.value })} />
              </Field>
              <Field label={t.eventTitleEn}>
                <input className="input w-full" dir="ltr" maxLength={120} value={form.title_en}
                  onChange={(e) => set({ title_en: e.target.value, ...(slugTouched ? {} : { slug: slugifyEvent(e.target.value) }) })} />
              </Field>
              <Field label={t.eventDescAr}>
                <textarea className="input w-full h-24 resize-y" dir="rtl" maxLength={1000} value={form.description_ar || ''}
                  onChange={(e) => set({ description_ar: e.target.value })} />
              </Field>
              <Field label={t.eventDescEn}>
                <textarea className="input w-full h-24 resize-y" dir="ltr" maxLength={1000} value={form.description_en || ''}
                  onChange={(e) => set({ description_en: e.target.value })} />
              </Field>
              <Field label={t.eventNoteAr} help={t.eventNoteHelp}>
                <input className="input w-full" dir="rtl" maxLength={300} value={form.note_ar || ''}
                  onChange={(e) => set({ note_ar: e.target.value })} />
              </Field>
              <Field label={t.eventNoteEn}>
                <input className="input w-full" dir="ltr" maxLength={300} value={form.note_en || ''}
                  onChange={(e) => set({ note_en: e.target.value })} />
              </Field>
              <Field label={t.eventBadgeAr}>
                <input className="input w-full" dir="rtl" maxLength={40} value={form.badge_ar || ''}
                  onChange={(e) => set({ badge_ar: e.target.value })} />
              </Field>
              <Field label={t.eventBadgeEn}>
                <input className="input w-full" dir="ltr" maxLength={40} value={form.badge_en || ''}
                  onChange={(e) => set({ badge_en: e.target.value })} />
              </Field>
              <Field label={t.eventSlug}>
                <input className="input w-full" dir="ltr" maxLength={48} value={form.slug}
                  onChange={(e) => { setSlugTouched(true); set({ slug: slugifyEvent(e.target.value) || e.target.value.toLowerCase() }); }} />
              </Field>
            </div>
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-bold text-[var(--accent)]">{t.eventTimeSection}</h5>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.eventStartsAt}>
                <input type="datetime-local" className="input w-full" dir="ltr" disabled={running || ended}
                  value={toLocalInput(form.starts_at)} onChange={(e) => set({ starts_at: fromLocalInput(e.target.value) })} />
              </Field>
              <Field label={t.eventEndsAt}>
                <input type="datetime-local" className="input w-full" dir="ltr" disabled={ended}
                  value={toLocalInput(form.ends_at)} onChange={(e) => set({ ends_at: fromLocalInput(e.target.value) })} />
              </Field>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{t.eventTimeHelp}</p>
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-bold text-[var(--accent)]">{t.eventPricesSection}</h5>
            <div className="grid gap-3 sm:grid-cols-2 items-start">
              <Field
                label={t.eventMarkupLabel}
                help={formatMessage(t.eventMarkupHelp, { current: baseMarkup ?? '…' })}
              >
                <input type="number" className="input w-full" dir="ltr" min="1" max="200" step="0.5" disabled={running || ended}
                  value={form.markup_percent} onChange={(e) => set({ markup_percent: e.target.value })} />
              </Field>
              <div className="pt-5">
                <Toggle checked={form.include_fixed !== false} onChange={(v) => !running && !ended && set({ include_fixed: v })}>
                  {t.eventIncludeFixed}
                </Toggle>
              </div>
            </div>
            {markupNumber != null && markupNumber < 3 && (
              <p className="text-xs text-amber-300">{t.eventMarkupLowWarning}</p>
            )}
            {!running && !ended && markupNumber != null && baseMarkup != null && markupNumber >= baseMarkup && (
              <p className="text-xs text-amber-300">{formatMessage(t.eventMarkupNotLower, { current: baseMarkup })}</p>
            )}
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-bold text-[var(--accent)]">{t.eventLookSection}</h5>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{t.eventLookHelp}</p>
            <div className="event-look-grid">
              {Object.values(EVENT_LOOKS).map((look) => (
                <button
                  key={look.id}
                  type="button"
                  aria-pressed={form.look === look.id}
                  onClick={() => set({ look: look.id })}
                  className={`event-look ${form.look === look.id ? 'event-look--active' : ''}`}
                >
                  <div
                    className="event-look__art"
                    style={look.swatch ? { backgroundImage: `url(${look.art})` } : { background: 'var(--bg-elevated)' }}
                    aria-hidden="true"
                  />
                  <div className="event-look__label">
                    <span>{t[look.labelKey]}</span>
                    {look.swatch && (
                      <span className="event-look__dots" aria-hidden="true">
                        {look.swatch.map((color) => <span key={color} style={{ background: color }} />)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t.eventDecorLabel}>
                <select className="input w-full" value={options.decor || ''} onChange={(e) => setOption({ decor: e.target.value || null })}>
                  <option value="">{t.eventDecorAuto}</option>
                  {EVENT_DECORS.map((decor) => <option key={decor} value={decor}>{t[DECOR_LABEL[decor]]}</option>)}
                </select>
              </Field>
              <Field label={t.eventBannerImage} help={t.eventBannerImageHelp}>
                <div className="flex gap-2">
                  <input className="input w-full text-sm" dir="ltr" placeholder="https://" value={form.banner_image_url || ''}
                    onChange={(e) => { setBannerFile(null); set({ banner_image_url: e.target.value }); }} />
                  <label className="btn btn-secondary text-sm inline-flex items-center gap-1.5 cursor-pointer shrink-0">
                    <Upload className="w-3.5 h-3.5" />
                    {bannerFile ? bannerFile.name.slice(0, 12) : t.upload}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setBannerFile(e.target.files?.[0] || null)} />
                  </label>
                </div>
              </Field>
            </div>
          </section>

          <section className="space-y-2">
            <h5 className="text-sm font-bold text-[var(--accent)]">{t.eventOptionsSection}</h5>
            <Toggle checked={options.banner !== false} onChange={(v) => setOption({ banner: v })}>{t.eventOptBanner}</Toggle>
            <Toggle checked={options.countdown !== false} onChange={(v) => setOption({ countdown: v })}>{t.eventOptCountdown}</Toggle>
            <Toggle checked={options.comparePrices !== false} onChange={(v) => setOption({ comparePrices: v })}>{t.eventOptComparePrices}</Toggle>
            <Toggle checked={options.carouselSlide !== false} onChange={(v) => setOption({ carouselSlide: v })}>{t.eventOptCarouselSlide}</Toggle>
          </section>

          <section className="space-y-3">
            <h5 className="text-sm font-bold text-[var(--accent)]">{t.eventOrderSection}</h5>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{t.eventOrderHelp}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn btn-secondary text-xs" disabled={orders.length === 0}
                onClick={() => setOption({ carouselSlugs: bestSellerSlugs() })}>
                {t.eventOrderBestSellers}
              </button>
              <button type="button" className="btn btn-secondary text-xs" disabled={options.carouselSlugs.length === 0}
                onClick={() => setOption({ carouselSlugs: [] })}>
                {t.eventOrderClear}
              </button>
              <select
                className="input text-xs py-1.5"
                value=""
                aria-label={t.eventOrderAdd}
                onChange={(e) => e.target.value && setOption({ carouselSlugs: [...options.carouselSlugs, e.target.value] })}
              >
                <option value="">{t.eventOrderAdd}</option>
                {games
                  .filter((g) => g.active !== false && g.slug && !options.carouselSlugs.includes(g.slug))
                  .map((g) => <option key={g.id} value={g.slug}>{gameName(g.slug)}</option>)}
              </select>
            </div>
            {options.carouselSlugs.length === 0 ? (
              <p className="text-xs text-[var(--text-sec)]">{t.eventOrderEmpty}</p>
            ) : (
              <ol className="space-y-1">
                {options.carouselSlugs.map((slug, index) => (
                  <li key={slug} className="flex items-center gap-2 text-sm rounded-lg border border-[var(--border)] px-2 py-1">
                    <span className="w-5 text-xs text-[var(--text-muted)] tabular-nums">{index + 1}</span>
                    <span className="flex-1 truncate">{gameName(slug)}</span>
                    <button type="button" className="p-1 rounded hover:bg-white/5 disabled:opacity-30" disabled={index === 0}
                      aria-label={t.moveUp} onClick={() => moveSlug(index, -1)}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="p-1 rounded hover:bg-white/5 disabled:opacity-30"
                      disabled={index === options.carouselSlugs.length - 1} aria-label={t.moveDown} onClick={() => moveSlug(index, 1)}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="p-1 rounded hover:bg-red-500/10 text-red-400" aria-label={t.eventDelete}
                      onClick={() => setOption({ carouselSlugs: options.carouselSlugs.filter((s) => s !== slug) })}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {error && <div className="rounded border border-red-500/60 bg-red-500/10 p-2 text-xs text-red-400">{error}</div>}

          <div className="flex flex-wrap gap-2">
            {!ended && (
              <button type="submit" disabled={!!busy} className="btn btn-primary inline-flex items-center gap-1.5 disabled:opacity-60">
                {busy === 'save' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {t.eventSave}
              </button>
            )}
            <button type="button" disabled={!!busy} className="btn btn-secondary inline-flex items-center gap-1.5"
              onClick={() => setEventPreview({ ...form, id: form.id || 'preview', ends_at: form.ends_at || new Date(Date.now() + 7 * 864e5).toISOString() })}>
              <Eye className="w-4 h-4" />
              {t.eventPreview}
            </button>
            {(form.status === 'draft' || form.status === 'scheduled') && (
              <>
                <button type="button" disabled={!!busy} className="btn btn-secondary inline-flex items-center gap-1.5 text-emerald-300"
                  onClick={() => setConfirm({ kind: 'start' })}>
                  {busy === 'start' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {t.eventStartNow}
                </button>
                <button type="button" disabled={!!busy} className="btn btn-secondary inline-flex items-center gap-1.5"
                  onClick={() => handleSchedule(form.status !== 'scheduled')}>
                  <CalendarClock className="w-4 h-4" />
                  {form.status === 'scheduled' ? t.eventUnschedule : t.eventScheduleBtn}
                </button>
              </>
            )}
            {running && (
              <button type="button" disabled={!!busy} className="btn btn-secondary inline-flex items-center gap-1.5 text-red-300"
                onClick={() => setConfirm({ kind: 'end' })}>
                {busy === 'end' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />}
                {t.eventEndNow}
              </button>
            )}
            {ended && (
              <button type="button" disabled={!!busy} className="btn btn-secondary inline-flex items-center gap-1.5" onClick={handleReuse}>
                <RotateCcw className="w-4 h-4" />
                {t.eventReuse}
              </button>
            )}
            {form.id && !running && (
              <button type="button" disabled={!!busy} className="btn btn-secondary inline-flex items-center gap-1.5 text-red-300"
                onClick={() => setConfirm({ kind: 'delete' })}>
                <Trash2 className="w-4 h-4" />
                {t.eventDelete}
              </button>
            )}
          </div>
        </form>
      )}

      <ConfirmDialog
        open={!!confirm}
        title={confirmCopy?.title}
        message={confirmCopy?.message}
        confirmLabel={confirmCopy?.title}
        cancelLabel={t.cancel}
        variant={confirmCopy?.variant}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirmCopy?.action;
          setConfirm(null);
          action?.();
        }}
      />
    </div>
  );
}
