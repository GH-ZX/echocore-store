import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  ScrollText,
  ShoppingBag,
  Wallet,
  AlertTriangle,
  LogIn,
  MessageSquare,
  Radio,
  HeartPulse,
} from 'lucide-react';
import { fetchAdminSiteLogs, formatDevLogLine, formatSiteLogCount, formatSiteLog } from '../../lib/siteLogs';
import {
  getHealthAckAt,
  setHealthAckAt,
  summarizeAdminActivity,
} from '../../lib/activityMonitor';

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

const POLL_MS = 20000;
const PAGE_SIZE = 40;
const RETENTION_DAYS = 30;

function resolveFilter(filterId) {
  if (filterId === '__critical') {
    return { category: null, severity: 'critical' };
  }
  return { category: filterId || null, severity: null };
}

function formatFeedTime(iso, lang) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

const HEALTH_STYLE = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100',
  busy: 'border-amber-500/30 bg-amber-500/10 text-amber-50',
  degraded: 'border-red-500/35 bg-red-500/10 text-red-100',
};

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
  const [page, setPage] = useState(0);
  const [logs, setLogs] = useState([]);
  const [monitorLogs, setMonitorLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [live, setLive] = useState(true);
  const [lastOkAt, setLastOkAt] = useState(null);
  const [fetchError, setFetchError] = useState(false);
  const [healthAckAt, setHealthAckAtState] = useState(() => getHealthAckAt());
  const loadInFlightRef = useRef(false);

  // Reset to first page when filter changes
  useEffect(() => {
    setPage(0);
  }, [filter]);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    if (!silent) setLoading(true);
    try {
      const { category, severity } = resolveFilter(filter);
      const offset = page * PAGE_SIZE;
      const [filtered, overview] = await Promise.all([
        fetchAdminSiteLogs({
          limit: PAGE_SIZE,
          offset,
          category,
          severity,
        }),
        fetchAdminSiteLogs({
          limit: 80,
          offset: 0,
          category: null,
          severity: null,
        }),
      ]);
      setLogs(filtered.logs);
      setTotal(filtered.total);
      setMonitorLogs(overview.logs);
      if (!silent) setExpandedId(null);
      setLastOkAt(Date.now());
      setFetchError(false);
    } catch (err) {
      if (!silent) notifyError(err.message);
      setFetchError(true);
      if (!silent) {
        setLogs([]);
        setTotal(0);
        setMonitorLogs([]);
      }
    } finally {
      if (!silent) setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [filter, page, notifyError]);

  useEffect(() => {
    load({ silent: false });
  }, [load]);

  useEffect(() => {
    if (!live) return undefined;
    const id = setInterval(() => load({ silent: true }), POLL_MS);
    return () => clearInterval(id);
  }, [live, load]);

  const stats = useMemo(() => {
    try {
      return summarizeAdminActivity(monitorLogs, { ackedAt: healthAckAt });
    } catch {
      return {
        orders24h: 0,
        recharges24h: 0,
        auth24h: 0,
        errors24h: 0,
        contact24h: 0,
        events1h: 0,
        criticalOpen: 0,
        health: 'ok',
        ackedAt: healthAckAt || null,
        sampleSize: 0,
      };
    }
  }, [monitorLogs, healthAckAt]);

  const markHealthReviewed = useCallback(() => {
    const ms = setHealthAckAt(Date.now());
    setHealthAckAtState(ms);
  }, []);
  const feedItems = useMemo(() => {
    return (monitorLogs || []).slice(0, 20).map((row, index) => {
      try {
        const formatted = formatSiteLog(row, t, lang);
        return {
          id: row?.id || `${row?.created_at}-${row?.event_type}-${index}`,
          title: String(formatted.title || row?.event_type || 'event'),
          body: String(formatted.body || ''),
          tone: String(formatted.tone || row?.severity || 'info'),
          createdAt: row?.created_at,
        };
      } catch {
        return {
          id: row?.id || `bad-${index}`,
          title: String(row?.event_type || 'log'),
          body: '',
          tone: 'danger',
          createdAt: row?.created_at,
        };
      }
    });
  }, [monitorLogs, t, lang]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const healthKey = fetchError
    ? 'activityHealthDown'
    : stats.health === 'degraded'
      ? 'activityHealthDegraded'
      : stats.health === 'busy'
        ? 'activityHealthBusy'
        : healthAckAt
          ? 'activityHealthOkAcked'
          : 'activityHealthOk';

  const healthStyle = fetchError ? HEALTH_STYLE.degraded : (HEALTH_STYLE[stats.health] || HEALTH_STYLE.ok);
  const canAckHealth = !fetchError && (stats.health === 'degraded' || stats.health === 'busy');

  const cards = [
    { key: 'orders', icon: ShoppingBag, label: t.activityCardOrders, value: stats.orders24h, hint: t.activityCardOrdersHint },
    { key: 'recharges', icon: Wallet, label: t.activityCardRecharges, value: stats.recharges24h, hint: t.activityCardRechargesHint },
    { key: 'errors', icon: AlertTriangle, label: t.activityCardErrors, value: stats.errors24h, hint: t.activityCardErrorsHint },
    { key: 'auth', icon: LogIn, label: t.activityCardAuth, value: stats.auth24h, hint: t.activityCardAuthHint },
    { key: 'contact', icon: MessageSquare, label: t.activityCardContact, value: stats.contact24h, hint: t.activityCardContactHint },
    { key: 'hour', icon: Radio, label: t.activityCardHour, value: stats.events1h, hint: t.activityCardHourHint },
  ];

  return (
    <div className="space-y-6 min-w-0">
      <section className="space-y-3" aria-labelledby="activity-monitor-heading">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2
              id="activity-monitor-heading"
              className="text-lg font-semibold text-[var(--text)] flex items-center gap-2"
            >
              <Activity size={20} className="text-[var(--accent)] shrink-0" />
              <span className="truncate">{t.activityMonitorTitle}</span>
            </h2>
            <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
              {t.activityMonitorSubtitle}
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {String(t.activityRetentionNote || '').replace('{days}', String(RETENTION_DAYS))}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLive((v) => !v)}
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold ${
                live
                  ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100'
                  : 'border-[var(--border)] text-[var(--text-sec)]'
              }`}
              title={t.activityLiveHint}
            >
              <span className={`w-2 h-2 rounded-full ${live ? 'bg-emerald-400 animate-pulse' : 'bg-[var(--text-muted)]'}`} />
              {live ? t.activityLiveOn : t.activityLiveOff}
            </button>
            <button
              type="button"
              onClick={() => load({ silent: false })}
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-[var(--border)] text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              {t.siteLogsRefresh}
            </button>
          </div>
        </div>

        <div className={`rounded-xl border px-3 py-2.5 flex flex-wrap items-center gap-2 text-xs ${healthStyle}`}>
          <HeartPulse size={16} className="shrink-0" />
          <span className="font-semibold">{t[healthKey] || t.activityHealthOk}</span>
          {lastOkAt ? (
            <span className="opacity-80" dir="ltr">
              {t.activityLastCheck}: {new Date(lastOkAt).toLocaleTimeString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US')}
            </span>
          ) : null}
          {canAckHealth ? (
            <button
              type="button"
              onClick={markHealthReviewed}
              className="ms-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-current/30 bg-black/15 hover:bg-black/25 font-semibold transition-colors"
              title={t.activityHealthAckHint}
            >
              <CheckCircle2 size={14} className="shrink-0" />
              {t.activityHealthAck}
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2 sm:gap-3">
          {cards.map((card) => (
            <div key={card.key} className="card p-3 sm:p-4 min-w-0">
              <card.icon className="w-4 h-4 text-[var(--accent)] mb-1.5" />
              <p className="text-[10px] sm:text-xs text-[var(--text-muted)] uppercase tracking-wide truncate">
                {card.label}
              </p>
              <p className="text-xl sm:text-2xl font-black mt-0.5 tabular-nums" dir="ltr">
                {loading && monitorLogs.length === 0 ? '—' : card.value}
              </p>
              <p className="text-[10px] text-[var(--text-sec)] mt-1 leading-snug line-clamp-2">
                {card.hint}
              </p>
            </div>
          ))}
        </div>

        <div className="card p-3 sm:p-4">
          <div className="flex items-center justify-between mb-3 gap-2">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Radio size={16} className="text-[var(--accent)]" />
              {t.activityLiveFeed}
            </h3>
            <span className="text-[10px] text-[var(--text-muted)]">
              {live ? t.activityLiveOn : t.activityLiveOff}
            </span>
          </div>
          {loading && feedItems.length === 0 ? (
            <div className="text-sm text-[var(--text-sec)] flex items-center gap-2 py-4">
              <Loader2 size={16} className="animate-spin" />
              {t.siteLogsLoading}
            </div>
          ) : feedItems.length === 0 ? (
            <p className="text-sm text-[var(--text-sec)] py-3">{t.siteLogsEmpty}</p>
          ) : (
            <ul className="space-y-1.5 max-h-[300px] overflow-y-auto pe-1">
              {feedItems.map((item) => (
                <li
                  key={item.id}
                  className={`rounded-lg border px-2.5 py-2 text-xs leading-snug ${
                    item.tone === 'danger' || item.tone === 'error'
                      ? 'border-red-500/30 bg-red-500/10'
                      : item.tone === 'warning'
                        ? 'border-amber-500/30 bg-amber-500/10'
                        : item.tone === 'success'
                          ? 'border-emerald-500/25 bg-emerald-500/10'
                          : 'border-[var(--border)] bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--text)] truncate">{item.title}</span>
                    <span className="text-[var(--text-muted)] shrink-0 font-mono" dir="ltr">
                      {formatFeedTime(item.createdAt, lang)}
                    </span>
                  </div>
                  {item.body ? (
                    <p className="text-[var(--text-sec)] mt-0.5 line-clamp-2">{item.body}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-3" aria-labelledby="site-logs-heading">
        <div className="min-w-0">
          <h2
            id="site-logs-heading"
            className="text-lg font-semibold text-[var(--text)] flex items-center gap-2"
          >
            <ScrollText size={20} className="text-[var(--accent)] shrink-0" />
            <span className="truncate">{t.siteLogsTitle}</span>
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
            {t.siteLogsSubtitle}
          </p>
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

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <p className="text-xs text-[var(--text-muted)] font-mono">
            {formatSiteLogCount(total, t)}
            {' · '}
            {String(t.siteLogsPageLabel || 'Page {page} / {pages}')
              .replace('{page}', String(page + 1))
              .replace('{pages}', String(totalPages))}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canPrev || loading}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs disabled:opacity-40"
            >
              <ChevronLeft size={14} />
              {t.siteLogsPrevPage}
            </button>
            <button
              type="button"
              disabled={!canNext || loading}
              onClick={() => setPage((p) => p + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs disabled:opacity-40"
            >
              {t.siteLogsNextPage}
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

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
                      {line.consoleLog ? (
                        <span className="dev-log-line__console" role="log">
                          {line.isAlert ? (
                            <span className="dev-log-line__console-label">
                              {t.siteLogsConsoleDump || 'console'}
                            </span>
                          ) : null}
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
      </section>
    </div>
  );
}
