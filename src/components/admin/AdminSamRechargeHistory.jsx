import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Copy,
  ExternalLink,
  History,
  Loader2,
  RefreshCw,
  Search,
  Wallet,
} from 'lucide-react';
import { listSamRechargeHistory } from '../../lib/samApi';
import { getAdminUserPath } from '../../lib/adminRoutes';
import { formatSamCurrencyAmount } from '../../lib/samWalletFormat';
import { formatDateTime, formatMessage } from '../../lib/i18n';

const SHAMCASH_LOGO_SRC = '/shamcash-logo.svg';

function StatusPill({ status, t }) {
  const classes = {
    pending: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    paid: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    expired: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    failed: 'border-red-500/30 bg-red-500/10 text-red-300',
    cancelled: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    approved: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
    payment_sent: 'border-blue-500/30 bg-blue-500/10 text-blue-300',
    rejected: 'border-red-500/30 bg-red-500/10 text-red-300',
    credited: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    completed: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    not_credited: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  }[status] || 'border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-sec)]';

  const label = t[`samHistoryStatus_${status}`] || t.samHistoryUnknownStatus;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap ${classes}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

function deriveSummaryStatus(inv) {
  if (inv.credit_status === 'credited') return 'completed';
  if (inv.request_status === 'rejected' || inv.payment_status === 'failed') return 'failed';
  if (inv.request_status === 'cancelled' || inv.payment_status === 'cancelled') return 'cancelled';
  if (inv.payment_status === 'expired') return 'expired';
  if (inv.payment_status === 'paid') return 'paid';
  if (inv.request_status === 'approved') return 'approved';
  if (inv.request_status === 'payment_sent') return 'payment_sent';
  return 'pending';
}

function MethodIcon({ method }) {
  if (method === 'syriatel') {
    return (
      <span className="sam-wallet-row__icon sam-wallet-row__icon--syriatel" aria-hidden>
        <SmartphoneIcon />
      </span>
    );
  }
  return (
    <span className="sam-wallet-row__icon sam-wallet-row__icon--sham" aria-hidden>
      <img
        src={SHAMCASH_LOGO_SRC}
        alt=""
        className="sam-wallet-row__brand-logo"
        width={22}
        height={26}
        decoding="async"
        draggable={false}
      />
    </span>
  );
}

function SmartphoneIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect width="14" height="20" x="5" y="2" rx="2" ry="2" />
      <path d="M12 18h.01" />
    </svg>
  );
}

const CARD_TONES = {
  neutral: { chip: 'bg-[var(--bg-primary)] text-[var(--text-sec)]' },
  amber: { chip: 'bg-amber-500/15 text-amber-400' },
  emerald: { chip: 'bg-emerald-500/15 text-emerald-400' },
  slate: { chip: 'bg-slate-500/15 text-slate-300' },
  violet: { chip: 'bg-violet-500/15 text-violet-400' },
};

function SummaryCard({ icon: Icon, label, value, tone = 'neutral' }) {
  const { chip } = CARD_TONES[tone] || CARD_TONES.neutral;
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 min-w-0">
      <span className={`p-1.5 rounded-lg shrink-0 ${chip}`}>
        <Icon className="w-3.5 h-3.5" />
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)] truncate">{label}</span>
        <span className="block text-sm font-bold tabular-nums leading-tight truncate" dir="ltr">{value}</span>
      </span>
    </div>
  );
}

export default function AdminSamRechargeHistory({ t = {}, lang = 'ar', onError, onSuccess, onOpenCustomer }) {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const onErrorRef = useRef(onError);
  const onSuccessRef = useRef(onSuccess);
  const requestRef = useRef(0);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  }, [onSuccess]);

  const notifyError = useCallback((message) => {
    onErrorRef.current?.(message);
  }, []);

  const notifySuccess = useCallback((message) => {
    onSuccessRef.current?.(message);
  }, []);

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    try {
      const data = await listSamRechargeHistory({
        status: statusFilter || undefined,
        method: methodFilter || undefined,
        search: search.trim() || undefined,
        page,
        pageSize,
      });
      if (requestId !== requestRef.current) return;
      setRows(data.rows);
      setTotal(data.total);
      setStats(data.stats);
    } catch (err) {
      if (requestId === requestRef.current) notifyError(err.message);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [statusFilter, methodFilter, search, page, pageSize, notifyError]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const applyFilter = (setter, value) => {
    setter(value);
    setPage(1);
  };

  const copyRef = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      notifySuccess(t.copied);
    } catch {
      notifyError(t.copyFailed);
    }
  };

  const byStatus = stats?.byRequestStatus || {};
  const byCreditStatus = stats?.byCreditStatus || {};

  const methodLabel = (inv) => inv.method === 'manual'
    ? (inv.payment_method || t.samHistoryManual)
    : (inv.method === 'syriatel' ? t.syriatelCash : t.shamCash);

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-primary)] p-4 sm:p-5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div className="p-2 rounded-xl shrink-0 bg-[var(--bg-surface)] text-[var(--text-sec)]">
            <History className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-base">{t.samHistoryTitle}</h3>
            <p className="text-sm text-[var(--text-sec)] mt-0.5">{t.samHistoryHelp}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="action-chip gap-1.5 text-xs"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {t.samHistoryRefresh}
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        <SummaryCard icon={History} label={t.samHistoryTotal} value={stats ? stats.total : t.samHistoryNoValue} />
        <SummaryCard icon={Clock} label={t.samHistoryStatus_pending} value={byStatus.pending || 0} tone="amber" />
        <SummaryCard icon={Wallet} label={t.samHistoryStatus_approved} value={byStatus.approved || 0} tone="emerald" />
        <SummaryCard icon={Clock} label={t.samHistoryStatus_rejected} value={byStatus.rejected || 0} tone="slate" />
        <SummaryCard icon={Wallet} label={t.samHistoryCredited} value={byCreditStatus.credited || 0} tone="violet" />
      </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="w-4 h-4 absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" aria-hidden />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t.samHistorySearchPlaceholder}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl ps-9 pe-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => applyFilter(setStatusFilter, '')}
              className={`action-chip text-xs !h-9 !min-h-9 px-3 ${statusFilter === '' ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
            >
              {t.samHistoryStatusAll}
            </button>
            {['pending', 'paid', 'expired', 'failed', 'cancelled', 'payment_sent', 'approved', 'rejected', 'credited', 'not_credited'].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => applyFilter(setStatusFilter, statusFilter === key ? '' : key)}
                className={`action-chip text-xs !h-9 !min-h-9 px-3 ${statusFilter === key ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
              >
               {t[`samHistoryStatus_${key}`] || t.samHistoryUnknownStatus}
              </button>
            ))}
            <span className="w-px bg-[var(--border)] mx-1 self-stretch hidden sm:block" aria-hidden />
            {['', 'manual', 'shamcash', 'syriatel'].map((key) => (
              <button
                key={key || 'all-method'}
                type="button"
                onClick={() => applyFilter(setMethodFilter, methodFilter === key ? '' : key)}
                className={`action-chip text-xs !h-9 !min-h-9 px-3 ${methodFilter === key ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10' : ''}`}
              >
               {key === '' ? t.samHistoryMethodAll : key === 'manual' ? t.samHistoryManual : key === 'shamcash' ? t.shamCash : t.syriatelCash}
              </button>
            ))}
          </div>
        </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-[var(--text-sec)] py-6">
          <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
          {t.samRechargeHistoryLoading}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-6 text-center">{t.samHistoryEmpty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((inv) => {
            const expanded = expandedId === inv.id;
            return (
              <div
                key={inv.id}
                className={`rounded-xl border bg-[var(--bg-primary)] transition-colors ${
                  expanded ? 'border-[var(--accent)]/40' : 'border-[var(--border)]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : inv.id)}
                  className="w-full flex items-center gap-2 sm:gap-3 px-3 sm:px-3.5 py-3 text-start"
                >
                  <MethodIcon method={inv.method} />
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                      <span className="text-sm font-semibold truncate">
                        {inv.customer_name || t.samHistoryCustomerUnknown}
                      </span>
                      <StatusPill status={deriveSummaryStatus(inv)} t={t} />
                    </span>
                    <span className="block text-[11px] font-mono text-[var(--text-muted)] mt-0.5 truncate" dir="ltr">
                      {inv.reference ? `#${inv.reference} · ` : ''}{formatDateTime(inv.created_at, lang)}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-semibold tabular-nums text-sm" dir="ltr">
                      {formatSamCurrencyAmount(inv.currency, inv.credited_amount ?? inv.requested_amount)}
                    </span>
                    <ChevronDown
                      className={`w-4 h-4 text-[var(--text-muted)] transition-transform ${expanded ? 'rotate-180' : ''}`}
                      aria-hidden
                    />
                  </span>
                </button>

                {expanded && (
                  <div className="px-3.5 pb-3.5 pt-1 space-y-3">
                    <div className="grid sm:grid-cols-2 gap-2 text-sm">
                      <DetailRow label={t.samHistorySamInvoiceId} mono>
                        {inv.sam_invoice_id ? <button type="button" onClick={() => copyRef(inv.sam_invoice_id)} className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline">
                          <span className="font-mono" dir="ltr">{inv.sam_invoice_id}</span><Copy className="w-3.5 h-3.5" />
                        </button> : <span className="text-[var(--text-muted)]">{t.samHistoryManual}</span>}
                      </DetailRow>
                      <DetailRow label={t.samHistoryMethodLabel} mono>{methodLabel(inv)}</DetailRow>
                      <DetailRow label={t.samHistoryTransactionRef} mono>
                        {inv.transaction_ref ? (
                          <button
                            type="button"
                            onClick={() => copyRef(inv.transaction_ref)}
                            className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                          >
                            <span className="font-mono" dir="ltr">{inv.transaction_ref}</span>
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                           <span className="text-[var(--text-muted)]">{t.samHistoryNoValue}</span>
                        )}
                      </DetailRow>
                      <DetailRow label={t.samHistoryRequestId} mono>{inv.recharge_request_id || t.samHistoryNoValue}</DetailRow>
                      {inv.payment_status && <DetailRow label={t.samHistoryPaymentStatus}><StatusPill status={inv.payment_status} t={t} /></DetailRow>}
                      {inv.request_status && <DetailRow label={t.samHistoryRequestStatus}><StatusPill status={inv.request_status} t={t} /></DetailRow>}
                      <DetailRow label={t.samHistoryCreditStatus}><StatusPill status={inv.credit_status} t={t} /></DetailRow>
                      <DetailRow label={t.samHistoryCreatedAt}>{formatDateTime(inv.created_at, lang)}</DetailRow>
                      <DetailRow label={t.samHistoryExpiresAt}>{inv.expires_at ? formatDateTime(inv.expires_at, lang) : t.samHistoryNoValue}</DetailRow>
                      <DetailRow label={t.samHistoryPaidAt}>{inv.paid_at ? formatDateTime(inv.paid_at, lang) : t.samHistoryNoValue}</DetailRow>
                      <DetailRow label={t.samHistoryWebhookAt}>{inv.webhook_received_at ? formatDateTime(inv.webhook_received_at, lang) : t.samHistoryNoValue}</DetailRow>
                      {inv.requested_amount != null && (
                        <DetailRow label={t.samHistoryRequestedUsd} mono>
                          {formatSamCurrencyAmount('USD', inv.requested_amount)}
                        </DetailRow>
                      )}
                      {inv.paid_amount != null && (
                        <DetailRow label={t.samHistoryPaidAmount} mono>
                          {formatSamCurrencyAmount(inv.currency, inv.paid_amount)}
                        </DetailRow>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => onOpenCustomer?.(getAdminUserPath(inv.customer_username || inv.customer_id))} className="action-chip gap-1.5 text-xs">
                        {t.samHistoryOpenCustomer}
                      </button>
                      {inv.payment_url && <a
                        href={inv.payment_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="action-chip gap-1.5 text-xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {t.samHistoryOpenPayment}
                      </a>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <span className="text-xs text-[var(--text-muted)] tabular-nums">
            {formatMessage(t.samHistoryPageInfo, {
              from: (page - 1) * pageSize + 1,
              to: Math.min(page * pageSize, total),
              total,
            })}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="action-chip text-xs gap-1.5 disabled:opacity-40"
            >
              <ChevronDown className="w-3.5 h-3.5 rotate-90" aria-hidden />
              {t.samHistoryPrev}
            </button>
            <span className="text-xs text-[var(--text-sec)] tabular-nums">
              {t.samHistoryPage} {page} / {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="action-chip text-xs gap-1.5 disabled:opacity-40"
            >
              {t.samHistoryNext}
              <ChevronDown className="w-3.5 h-3.5 -rotate-90" aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function DetailRow({ label, children, mono = false }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-surface)] px-3 py-2 min-w-0">
      <span className="text-[11px] text-[var(--text-muted)] shrink-0">{label}</span>
      <span className={`text-xs truncate text-right ${mono ? 'font-mono' : ''}`}>{children}</span>
    </div>
  );
}
