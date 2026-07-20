import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Wallet,
  HandCoins,
  FileText,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  History,
} from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import AdminManualBalanceCredit from './AdminManualBalanceCredit';
import AdminCustomerBalances from './AdminCustomerBalances';
import { formatMessage } from '../../lib/i18n';
import {
  fetchAdminRechargeRequests,
  approveRechargeRequest,
  rejectRechargeRequest,
  expireStalePendingRecharges,
} from '../../lib/recharge';
import {
  canGrantExpiredSamBalance,
  getAdminRechargeDisplayStatus,
  getAdminRechargeStatusTone,
  isSamApiAwaitingPayment,
  needsLegacyManualReview,
} from '../../lib/adminRecharge';
import { isInvoiceReadyForRecharge } from '../../lib/invoices';
import { INVOICE_KIND } from '../../lib/invoiceBuilder';
import { getAdminUserWalletFlowPath } from '../../lib/adminRoutes';
import { getProfileUsername } from '../../lib/username';

const PAGE_SIZE = 25;

const FILTER_OPTIONS = [
  { id: 'all', labelKey: 'adminRechargeFilterAll' },
  { id: 'approved', labelKey: 'adminRechargeFilterApproved' },
  { id: 'payment_sent', labelKey: 'adminRechargeFilterAwaiting' },
  { id: 'pending', labelKey: 'adminRechargeFilterNew' },
  { id: 'rejected', labelKey: 'adminRechargeFilterRejected' },
  { id: 'cancelled', labelKey: 'adminRechargeFilterCancelled' },
];

const STATUS_LABEL_KEYS = {
  pending: 'adminRechargeStatusPending',
  payment_sent: 'adminRechargeStatusPaymentSent',
  approved: 'adminRechargeStatusApproved',
  rejected: 'adminRechargeStatusRejected',
  cancelled: 'adminRechargeStatusCancelled',
  sam_awaiting: 'adminRechargeStatusSamAwaiting',
};

function formatRechargeDate(value, lang) {
  if (!value) return '—';
  return new Date(value).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatMoney(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  return `$${n.toFixed(2)}`;
}

function formatSyp(value) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return '—';
  return `${Math.round(n).toLocaleString('en-US')} SYP`;
}

function isSypPayCurrency(req) {
  return String(req?.pay_currency || '').toUpperCase() === 'SYP';
}

function sypPaidAmount(req) {
  const usd = parseFloat(req?.amount);
  const rate = parseFloat(req?.syp_per_usd_snapshot);
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) return null;
  return usd * rate;
}

function getPaymentMethodLabel(method, t) {
  if (method === 'ShamCash') return t.shamCash || 'ShamCash';
  if (method === 'SyriatelCash') return t.syriatelCash || 'Syriatel Cash';
  return method || '—';
}

function RechargeStatusBadge({ displayStatus, t }) {
  const tone = getAdminRechargeStatusTone(displayStatus);
  const labelKey = STATUS_LABEL_KEYS[displayStatus];
  return (
    <span className={`admin-order-status admin-order-status--${tone}`}>
      {labelKey ? t[labelKey] : displayStatus}
    </span>
  );
}

function DetailRow({ label, value, mono = false, dir }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-[var(--border)]/60 last:border-0">
      <span className="text-[11px] text-[var(--text-muted)] shrink-0">{label}</span>
      <span
        className={`text-xs text-end break-all ${mono ? 'font-mono text-[var(--text-sec)]' : 'font-semibold'}`}
        dir={dir}
      >
        {value}
      </span>
    </div>
  );
}

export default function AdminRechargeManager({
  t = {},
  lang = 'ar',
  onApproved,
  onNotify,
  paymentConfig = {},
}) {
  const navigate = useNavigate();
  const onNotifyRef = useRef(onNotify);
  useEffect(() => {
    onNotifyRef.current = onNotify;
  }, [onNotify]);

  const notifyError = useCallback((message) => {
    onNotifyRef.current?.(message, 'error');
  }, []);

  const notifySuccess = useCallback((message) => {
    onNotifyRef.current?.(message, 'success');
  }, []);

  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [filter, setFilter] = useState('all');
  const [requests, setRequests] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [expandedId, setExpandedId] = useState(null);
  const [creditPreset, setCreditPreset] = useState(null);
  const [balancesRefreshKey, setBalancesRefreshKey] = useState(0);
  const [grantConfirmTarget, setGrantConfirmTarget] = useState(null);
  const loadInFlightRef = useRef(false);
  const manualCreditRef = useRef(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE) || 1);
  const safePage = Math.min(page, totalPages - 1);

  const load = useCallback(async (status = filter, pageIndex = safePage) => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      try {
        await expireStalePendingRecharges(20);
      } catch (expireErr) {
        console.warn('expire_stale_pending_recharges:', expireErr);
      }

      const data = await fetchAdminRechargeRequests(status, {
        limit: PAGE_SIZE,
        offset: pageIndex * PAGE_SIZE,
      });
      setRequests(Array.isArray(data.rows) ? data.rows : []);
      setTotal(Number(data.total) || 0);
      setExpandedId(null);
    } catch (err) {
      notifyError(err.message);
      setRequests([]);
      setTotal(0);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [filter, safePage, notifyError]);

  useEffect(() => {
    load(filter, safePage);
  }, [load, filter, safePage]);

  useEffect(() => {
    if (page > 0 && page >= totalPages) {
      setPage(Math.max(0, totalPages - 1));
    }
  }, [page, totalPages]);

  const setFilterAndReset = (id) => {
    setFilter(id);
    setPage(0);
  };

  const toggleExpanded = (id) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleApprove = async (requestId) => {
    setProcessingId(requestId);
    try {
      const result = await approveRechargeRequest(requestId);
      notifySuccess(
        `${t.rechargeApproved} +$${parseFloat(result.amount).toFixed(2)}`,
      );
      onApproved?.(result);
      setBalancesRefreshKey((key) => key + 1);
      await load(filter, safePage);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (requestId) => {
    setProcessingId(requestId);
    try {
      await rejectRechargeRequest(requestId, null);
      notifySuccess(t.rechargeRejected);
      await load(filter, safePage);
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const openRecoveryCredit = (req) => {
    setCreditPreset({
      user: {
        id: req.user_id,
        name: req.user_name,
        username: req.username,
        email: req.user_email,
        balance: req.user_balance,
      },
      amount: req.amount,
      requestId: req.id,
      defaultReason: t.adminManualCreditReason_shamcashExpiredRecovery,
    });
    setGrantConfirmTarget(null);
    requestAnimationFrame(() => {
      manualCreditRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const openCreditForUser = (user) => {
    setCreditPreset({
      user,
      amount: null,
      requestId: null,
    });
  };

  const openWalletFlow = (req) => {
    const key = req.username || getProfileUsername(req) || req.user_id;
    if (!key) return;
    navigate(getAdminUserWalletFlowPath(key));
  };

  const rangeStart = total === 0 ? 0 : safePage * PAGE_SIZE + 1;
  const rangeEnd = Math.min(total, (safePage + 1) * PAGE_SIZE);

  const renderActions = (req) => {
    const manual = needsLegacyManualReview(req, paymentConfig);
    const samAwaiting = isSamApiAwaitingPayment(req);
    const recoverable = canGrantExpiredSamBalance(req);
    const busy = processingId === req.id;
    const invoiceReady = isInvoiceReadyForRecharge(req, { isAdmin: true });

    const invoiceButton = invoiceReady ? (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          navigate(`/invoice/${INVOICE_KIND.RECHARGE}/${req.id}`);
        }}
        className="action-chip gap-1 text-xs !py-1.5"
        title={t.viewInvoice}
      >
        <FileText className="w-3.5 h-3.5" />
        {t.viewInvoice}
      </button>
    ) : null;

    return (
      <div
        className="flex flex-wrap gap-1.5"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => openWalletFlow(req)}
          className="action-chip gap-1 text-xs !py-1.5"
          title={t.adminTrackPurchases}
        >
          <History className="w-3.5 h-3.5" />
          {t.adminTrackPurchases}
        </button>
        {manual ? (
          <>
            <button
              type="button"
              onClick={() => handleApprove(req.id)}
              disabled={busy}
              className="action-chip gap-1 text-xs !py-1.5"
              title={t.approveRecharge}
            >
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
              {t.approveRecharge}
            </button>
            <button
              type="button"
              onClick={() => handleReject(req.id)}
              disabled={busy}
              className="action-chip gap-1 text-xs !py-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10"
              title={t.rejectRecharge}
            >
              <XCircle className="w-3.5 h-3.5" />
              {t.rejectRecharge}
            </button>
            {invoiceButton}
          </>
        ) : samAwaiting ? (
          <>
            <span className="text-[10px] text-[var(--text-muted)] leading-snug self-center max-w-[12rem]">
              {t.adminRechargeSamAwaitingHint}
            </span>
            {invoiceButton}
          </>
        ) : recoverable ? (
          <>
            <button
              type="button"
              onClick={() => setGrantConfirmTarget(req)}
              className="action-chip gap-1 text-xs !py-1.5"
              title={t.adminManualCreditGrant}
            >
              <HandCoins className="w-3.5 h-3.5" />
              {t.adminManualCreditGrant}
            </button>
            {invoiceButton}
          </>
        ) : (
          invoiceButton
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4 min-w-0">
      <AdminCustomerBalances
        t={t}
        onNotify={onNotify}
        refreshKey={balancesRefreshKey}
        onSelectForCredit={openCreditForUser}
      />

      <div ref={manualCreditRef}>
        <AdminManualBalanceCredit
          t={t}
          lang={lang}
          onNotify={onNotify}
          presetUser={creditPreset?.user || null}
          presetAmount={creditPreset?.amount ?? null}
          presetRequestId={creditPreset?.requestId || null}
          presetReason={creditPreset?.defaultReason || ''}
          onCredited={() => {
            setCreditPreset(null);
            setBalancesRefreshKey((key) => key + 1);
            load(filter, safePage);
          }}
        />
      </div>

      <ConfirmDialog
        open={!!grantConfirmTarget}
        title={t.adminManualCreditGrantConfirmTitle}
        message={grantConfirmTarget ? formatMessage(t.adminManualCreditGrantConfirmBody, {
          amount: `$${parseFloat(grantConfirmTarget.amount || 0).toFixed(2)}`,
          user: grantConfirmTarget.user_name || t.adminUsersUnnamed,
        }) : ''}
        confirmLabel={t.adminManualCreditGrantConfirmAction}
        cancelLabel={t.cancel}
        variant="primary"
        onConfirm={() => grantConfirmTarget && openRecoveryCredit(grantConfirmTarget)}
        onCancel={() => setGrantConfirmTarget(null)}
      />

      <section className="card overflow-hidden min-w-0">
        <div className="p-4 sm:p-5 border-b border-[var(--border)] flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
              <Wallet className="w-5 h-5 text-green-400 shrink-0" />
              <span className="truncate">{t.rechargeQueue}</span>
            </h2>
            <p className="text-xs sm:text-sm text-[var(--text-sec)] mt-1 max-w-2xl leading-relaxed">
              {t.rechargeQueueHelp}
            </p>
          </div>
          <div className="text-end shrink-0">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide">
              {t.adminCustomerBalancesTotal || t.rechargeQueue}
            </div>
            <div className="font-mono font-black text-[var(--accent)] text-lg">
              {formatMessage(t.adminRechargeCount || '{count}', { count: total })}
            </div>
          </div>
        </div>

        <div className="p-3 sm:p-5 border-b border-[var(--border)] space-y-3">
          <div className="flex flex-nowrap sm:flex-wrap gap-2 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => setFilterAndReset(option.id)}
                className={`action-chip text-xs shrink-0 ${
                  filter === option.id
                    ? 'border-[var(--accent)]/50 text-[var(--accent)] bg-[var(--accent)]/10'
                    : ''
                }`}
              >
                {t[option.labelKey]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => load(filter, safePage)}
            className="action-chip gap-2 w-full sm:w-auto justify-center"
          >
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>

        {loading ? (
          <div className="p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
          </div>
        ) : requests.length === 0 ? (
          <div className="p-10 text-center text-[var(--text-sec)] text-sm">
            {t.noRechargeRequests}
          </div>
        ) : (
          <>
            <div className="divide-y divide-[var(--border)]">
              {requests.map((req) => {
                const displayStatus = getAdminRechargeDisplayStatus(req);
                const expanded = expandedId === req.id;
                const amount = formatMoney(req.amount);
                const balanceAfter = req.balance_after != null ? formatMoney(req.balance_after) : null;
                const balanceBefore = req.balance_before != null ? formatMoney(req.balance_before) : null;
                const payIsSyp = isSypPayCurrency(req);
                const sypPaid = payIsSyp ? sypPaidAmount(req) : null;
                const currencyLabel = req.pay_currency
                  ? String(req.pay_currency).toUpperCase()
                  : null;

                return (
                  <div key={req.id} className="min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpanded(req.id)}
                      aria-expanded={expanded}
                      className="w-full text-start p-3 sm:p-4 hover:bg-[var(--accent)]/[0.04] transition-colors"
                    >
                      <div className="flex items-start gap-2.5 sm:gap-3">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-bold text-sm truncate">
                              {req.user_name || t.adminUsersUnnamed}
                            </span>
                            {req.username && (
                              <span className="text-[10px] font-mono text-[var(--text-muted)]" dir="ltr">
                                @{req.username}
                              </span>
                            )}
                            <RechargeStatusBadge displayStatus={displayStatus} t={t} />
                          </div>
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                            <span className="font-mono font-black text-[var(--accent)] text-base">
                              {amount}
                            </span>
                            <span className="text-xs text-[var(--text-sec)]">
                              {getPaymentMethodLabel(req.payment_method, t)}
                            </span>
                            <span className="text-[11px] text-[var(--text-muted)]">
                              {formatRechargeDate(req.created_at, lang)}
                            </span>
                          </div>
                          {balanceAfter && (
                            <div className="text-[11px] font-mono text-emerald-400/90">
                              {t.adminRechargeBalanceAfter}: {balanceAfter}
                            </div>
                          )}
                          {!expanded && (
                            <div className="text-[10px] text-[var(--text-muted)]">
                              {t.adminRechargeExpandHint}
                            </div>
                          )}
                        </div>
                        <ChevronDown
                          className={`w-5 h-5 text-[var(--text-muted)] shrink-0 mt-0.5 transition-transform ${
                            expanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden
                        />
                      </div>
                    </button>

                    {expanded && (
                      <div className="px-3 sm:px-4 pb-4 space-y-3 bg-[var(--bg-primary)]/35 border-t border-[var(--border)]/70">
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)]/60 p-3 mt-3">
                          <DetailRow
                            label={t.adminRechargeBalanceBefore}
                            value={balanceBefore}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargeAmount}
                            value={amount}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargePayCurrency}
                            value={currencyLabel}
                            dir="ltr"
                          />
                          {payIsSyp && sypPaid != null && (
                            <DetailRow
                              label={t.adminRechargeSypPaid}
                              value={formatSyp(sypPaid)}
                              mono
                              dir="ltr"
                            />
                          )}
                          {payIsSyp && req.syp_per_usd_snapshot != null && (
                            <DetailRow
                              label={t.adminRechargeSypRate}
                              value={String(req.syp_per_usd_snapshot)}
                              mono
                              dir="ltr"
                            />
                          )}
                          <DetailRow
                            label={t.adminRechargeBalanceAfter}
                            value={balanceAfter}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargeCurrentBalance}
                            value={req.user_balance != null ? formatMoney(req.user_balance) : null}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargeReference}
                            value={req.reference || null}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.paymentMethod}
                            value={getPaymentMethodLabel(req.payment_method, t)}
                          />
                          <DetailRow
                            label={t.email}
                            value={req.user_email || null}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargeDate}
                            value={formatRechargeDate(req.created_at, lang)}
                          />
                          <DetailRow
                            label={t.adminRechargeReviewedAt}
                            value={req.reviewed_at ? formatRechargeDate(req.reviewed_at, lang) : null}
                          />
                          <DetailRow
                            label={t.adminRechargeUpdatedAt}
                            value={req.updated_at ? formatRechargeDate(req.updated_at, lang) : null}
                          />
                          <DetailRow
                            label={t.adminRechargeSamInvoice}
                            value={req.sam_invoice_id || null}
                            mono
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargeSamStatus}
                            value={req.sam_invoice_status || null}
                            dir="ltr"
                          />
                          <DetailRow
                            label={t.adminRechargeSamExpires}
                            value={req.sam_invoice_expires_at
                              ? formatRechargeDate(req.sam_invoice_expires_at, lang)
                              : null}
                          />
                          <DetailRow
                            label={t.adminRechargeAdminNote}
                            value={req.admin_note || null}
                          />
                          <DetailRow
                            label={t.adminRechargeRequestId}
                            value={req.id}
                            mono
                            dir="ltr"
                          />
                        </div>
                        {renderActions(req)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="p-3 sm:p-4 border-t border-[var(--border)] flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-[var(--text-muted)]">
                {formatMessage(t.adminCustomerBalancesPageRange || '{from}–{to} of {total}', {
                  from: rangeStart,
                  to: rangeEnd,
                  total,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 0 || loading}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="action-chip gap-1 text-xs disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  {t.prev || 'Prev'}
                </button>
                <span className="text-xs font-mono text-[var(--text-sec)] min-w-[4.5rem] text-center">
                  {safePage + 1} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages - 1 || loading}
                  onClick={() => setPage((p) => p + 1)}
                  className="action-chip gap-1 text-xs disabled:opacity-40"
                >
                  {t.next || 'Next'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
