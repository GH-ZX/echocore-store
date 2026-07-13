import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { fetchAdminSiteLogs, formatSiteLog, formatSiteLogCount } from '../../lib/siteLogs';

const FILTER_OPTIONS = [
  { id: null, labelKey: 'siteLogsFilterAll' },
  { id: 'auth', labelKey: 'siteLogsFilterAuth' },
  { id: 'recharge', labelKey: 'siteLogsFilterRecharge' },
  { id: 'order', labelKey: 'siteLogsFilterOrder' },
  { id: 'contact', labelKey: 'siteLogsFilterContact' },
];

const TONE_CLASS = {
  info: 'admin-order-status--muted',
  success: 'admin-order-status--success',
  warning: 'admin-order-status--warning',
  danger: 'admin-order-status--danger',
};

function formatLogDate(value, lang) {
  if (!value) return '—';
  return new Date(value).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function LogToneBadge({ tone, label }) {
  const toneClass = TONE_CLASS[tone] || TONE_CLASS.info;
  return (
    <span className={`admin-order-status ${toneClass}`}>
      {label}
    </span>
  );
}

export default function AdminSiteLogs({ t = {}, lang = 'ar', onNotify }) {
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const notifyError = useCallback((message) => {
    onNotifyRef.current?.(message, 'error');
  }, []);

  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState(null);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const result = await fetchAdminSiteLogs({ limit: 100, offset: 0, category: filter });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (err) {
      notifyError(err.message);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [filter, notifyError]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
            <ScrollText size={20} className="text-[var(--accent)]" />
            {t.siteLogsTitle}
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1">{t.siteLogsSubtitle}</p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t.siteLogsRefresh}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((option) => {
          const isActive = filter === option.id;
          return (
            <button
              key={option.labelKey}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {t[option.labelKey]}
            </button>
          );
        })}
      </div>

      <p className="text-xs text-[var(--text-muted)]">
        {formatSiteLogCount(total, t)}
      </p>

      {loading && logs.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-[var(--text-sec)] gap-2">
          <Loader2 size={20} className="animate-spin" />
          {t.siteLogsLoading}
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16 text-[var(--text-sec)] text-sm">
          {t.siteLogsEmpty}
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((item) => {
            const formatted = formatSiteLog(item, t, lang);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <LogToneBadge tone={formatted.tone} label={formatted.categoryLabel} />
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatLogDate(formatted.createdAt, lang)}
                    </span>
                  </div>
                </div>
                <h3 className="text-sm font-semibold text-[var(--text)]">
                  {formatted.title}
                </h3>
                <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
                  {formatted.body}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}