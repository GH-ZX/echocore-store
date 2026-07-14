import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { fetchAdminSiteLogs, formatDevLogLine, formatSiteLogCount } from '../../lib/siteLogs';

const FILTER_OPTIONS = [
  { id: null, labelKey: 'siteLogsFilterAll' },
  { id: 'auth', labelKey: 'siteLogsFilterAuth' },
  { id: 'recharge', labelKey: 'siteLogsFilterRecharge' },
  { id: 'order', labelKey: 'siteLogsFilterOrder' },
  { id: 'contact', labelKey: 'siteLogsFilterContact' },
  { id: 'dev', labelKey: 'siteLogsFilterDev' },
];

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
      const result = await fetchAdminSiteLogs({ limit: 200, offset: 0, category: filter });
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
    <div className="space-y-4">
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

      <p className="text-xs text-[var(--text-muted)] font-mono">
        {formatSiteLogCount(total, t)}
      </p>

      <div className="dev-log-terminal" dir="ltr">
        {loading && logs.length === 0 ? (
          <div className="dev-log-line dev-log-line--info dev-log-line--status">
            <Loader2 size={14} className="animate-spin inline-block me-2" />
            {t.siteLogsLoading}
          </div>
        ) : logs.length === 0 ? (
          <div className="dev-log-line dev-log-line--info dev-log-line--status">
            {t.siteLogsEmpty}
          </div>
        ) : (
          logs.map((item) => {
            const line = formatDevLogLine(item, lang);
            return (
              <div
                key={line.id}
                className={`dev-log-line dev-log-line--${line.severity}`}
                title={line.text}
              >
                {line.text}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}