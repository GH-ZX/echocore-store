import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronDown, Loader2, RefreshCw, ScrollText } from 'lucide-react';
import { fetchAdminSiteLogs, formatDevLogLine, formatSiteLogCount } from '../../lib/siteLogs';

/** Filters: category id or special severity mode */
const FILTER_OPTIONS = [
  { id: null, labelKey: 'siteLogsFilterAll' },
  { id: 'order', labelKey: 'siteLogsFilterOrder' },
  { id: 'recharge', labelKey: 'siteLogsFilterRecharge' },
  { id: 'wallet', labelKey: 'siteLogsFilterWallet' },
  { id: 'error', labelKey: 'siteLogsFilterErrors' },
  { id: '__critical', labelKey: 'siteLogsFilterCritical' },
  { id: 'auth', labelKey: 'siteLogsFilterAuth' },
  { id: 'contact', labelKey: 'siteLogsFilterContact' },
  { id: 'dev', labelKey: 'siteLogsFilterDev' },
];

function resolveFilter(filterId) {
  if (filterId === '__critical') {
    return { category: null, severity: 'critical' };
  }
  return { category: filterId || null, severity: null };
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
  const [expandedId, setExpandedId] = useState(null);
  const loadInFlightRef = useRef(false);

  const load = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const { category, severity } = resolveFilter(filter);
      const result = await fetchAdminSiteLogs({
        limit: 200,
        offset: 0,
        category,
        severity,
      });
      setLogs(result.logs);
      setTotal(result.total);
      setExpandedId(null);
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

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-4 min-w-0">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text)] flex items-center gap-2">
            <ScrollText size={20} className="text-[var(--accent)] shrink-0" />
            <span className="truncate">{t.siteLogsTitle}</span>
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
            {t.siteLogsSubtitle}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50 w-full sm:w-auto shrink-0"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          {t.siteLogsRefresh}
        </button>
      </div>

      <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto pb-1 -mx-0.5 px-0.5 scrollbar-thin">
        {FILTER_OPTIONS.map((option) => {
          const isActive = filter === option.id;
          return (
            <button
              key={option.labelKey}
              type="button"
              onClick={() => setFilter(option.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors shrink-0 ${
                isActive
                  ? 'bg-[var(--accent)] text-white border-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
              }`}
            >
              {t[option.labelKey] || option.labelKey}
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
            const expanded = expandedId === line.id;
            return (
              <button
                key={line.id}
                type="button"
                className={`dev-log-line dev-log-line--${line.severity}${expanded ? ' dev-log-line--expanded' : ''}`}
                onClick={() => toggleExpanded(line.id)}
                aria-expanded={expanded}
                title={line.text}
              >
                <span className="dev-log-line__row">
                  <span className="dev-log-line__body">{line.body}</span>
                  <span className="dev-log-line__meta">
                    <span className="dev-log-line__time">{line.timestamp}</span>
                    <ChevronDown
                      size={14}
                      className={`dev-log-line__chevron${expanded ? ' dev-log-line__chevron--open' : ''}`}
                      aria-hidden="true"
                    />
                  </span>
                </span>
                {expanded && (
                  <span className="dev-log-line__detail">
                    {line.fields ? (
                      <span className="dev-log-line__fields">{line.fields}</span>
                    ) : null}
                    {line.isAlert && line.consoleLog ? (
                      <span className="dev-log-line__console" role="log">
                        <span className="dev-log-line__console-label">
                          {t.siteLogsConsoleDump || 'console'}
                        </span>
                        <pre className="dev-log-line__console-pre">{line.consoleLog}</pre>
                      </span>
                    ) : null}
                    {!line.isAlert && line.consoleLog ? (
                      <span className="dev-log-line__console" role="log">
                        <pre className="dev-log-line__console-pre">{line.consoleLog}</pre>
                      </span>
                    ) : null}
                    <span className="dev-log-line__detail-time">{line.timestamp}</span>
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
