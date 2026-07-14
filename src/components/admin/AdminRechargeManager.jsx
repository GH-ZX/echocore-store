import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, RefreshCw, Wallet, HandCoins } from 'lucide-react';
import ConfirmDialog from '../ui/ConfirmDialog';
import AdminManualBalanceCredit from './AdminManualBalanceCredit';
import AdminCustomerBalances from './AdminCustomerBalances';
import { formatMessage } from '../../lib/i18n';
import {
  fetchAdminRechargeRequests,
  approveRechargeRequest,
  rejectRechargeRequest,
} from '../../lib/recharge';

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
};

const STATUS_TONE = {
  pending: 'pending',
  payment_sent: 'warning',
  approved: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

function formatRechargeDate(value, lang) {
  if (!value) return '—';
  return new Date(value).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function getPaymentMethodLabel(method, t) {
  if (method === 'ShamCash') return t.shamCash || 'ShamCash';
  if (method === 'SyriatelCash') return t.syriatelCash || 'Syriatel Cash';
  return method || '—';
}

function RechargeStatusBadge({ status, t }) {
  const tone = STATUS_TONE[status] || 'muted';
  const labelKey = STATUS_LABEL_KEYS[status];
  return (
    <span className={`admin-order-status admin-order-status--${tone}`}>
      {labelKey ? t[labelKey] : status}
    </span>
  );
}

export default function AdminRechargeManager({ t = {}, lang = 'ar', onApproved, onNotify }) {
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
  const [creditPreset, setCreditPreset] = useState(null);
  const [balancesRefreshKey, setBalancesRefreshKey] = useState(0);
  const [grantConfirmTarget, setGrantConfirmTarget] = useState(null);
  const loadInFlightRef = useRef(false);
  const manualCreditRef = useRef(null);

  const load = useCallback(async () => {
    if (loadInFlightRef.current) return;
    loadInFlightRef.current = true;
    setLoading(true);
    try {
      const data = await fetchAdminRechargeRequests(filter);
      setRequests(data);
    } catch (err) {
      notifyError(err.message);
      setRequests([]);
    } finally {
      setLoading(false);
      loadInFlightRef.current = false;
    }
  }, [filter, notifyError]);

  useEffect(() => {
    load();
  }, [load]);

  const handleApprove = async (requestId) => {
    setProcessingId(requestId);
    try {
      const result = await approveRechargeRequest(requestId);
      notifySuccess(
        `${t.rechargeApproved} +$${parseFloat(result.amount).toFixed(2)}`,
      );
      onApproved?.(result);
      setBalancesRefreshKey((key) => key + 1);
      await load();
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
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const needsManualReview = (status) => status === 'pending' || status === 'payment_sent';
  const canRecoverBalance = (status) => status === 'cancelled' || status === 'rejected';

  const openRecoveryCredit = (req) => {
    setCreditPreset({
      user: {
        id: req.user_id,
        name: req.user_name,
        email: null,
        balance: null,
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

  return (
    <div className="space-y-4">
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
          load();
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

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Wallet className="w-5 h-5 text-green-400" />
            {t.rechargeQueue}
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1 max-w-2xl">
            {t.rechargeQueueHelp}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none"
          >
            {FILTER_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {t[option.labelKey]}
              </option>
            ))}
          </select>
          <button type="button" onClick={load} className="action-chip gap-2">
            <RefreshCw className="w-4 h-4" />
            {t.refresh}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="card p-10 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
        </div>
      ) : requests.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          {t.noRechargeRequests}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-[var(--text-muted)] text-xs">
                  <th className="text-start p-3">{t.adminRechargeUser}</th>
                  <th className="text-start p-3">{t.adminRechargeAmount}</th>
                  <th className="text-start p-3">{t.paymentMethod}</th>
                  <th className="text-start p-3">{t.adminRechargeReference}</th>
                  <th className="text-start p-3">{t.adminRechargeDate}</th>
                  <th className="text-start p-3">{t.adminOrderStatus}</th>
                  <th className="text-end p-3" />
                </tr>
              </thead>
              <tbody>
                {requests.map((req) => {
                  const manual = needsManualReview(req.status);
                  const busy = processingId === req.id;

                  return (
                    <tr key={req.id} className="border-b border-[var(--border)] last:border-0 align-top">
                      <td className="p-3 min-w-[10rem]">
                        <div className="font-semibold truncate">{req.user_name || t.adminUsersUnnamed}</div>
                        <div className="text-[10px] text-[var(--text-muted)] font-mono mt-0.5 break-all">
                          {req.user_id}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-bold text-[var(--accent)] whitespace-nowrap">
                        ${parseFloat(req.amount).toFixed(2)}
                      </td>
                      <td className="p-3 text-[var(--text-sec)] whitespace-nowrap">
                        {getPaymentMethodLabel(req.payment_method, t)}
                      </td>
                      <td className="p-3 font-mono text-xs text-[var(--text-muted)] break-all max-w-[12rem]">
                        {req.reference || '—'}
                      </td>
                      <td className="p-3 text-[var(--text-sec)] whitespace-nowrap">
                        {formatRechargeDate(req.created_at, lang)}
                      </td>
                      <td className="p-3">
                        <RechargeStatusBadge status={req.status} t={t} />
                      </td>
                      <td className="p-3 text-end whitespace-nowrap">
                        {manual ? (
                          <div className="inline-flex flex-col items-end gap-1.5">
                            <span className="text-[10px] text-[var(--text-muted)]">{t.adminRechargeManualHint}</span>
                            <div className="flex gap-1.5">
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
                            </div>
                          </div>
                        ) : canRecoverBalance(req.status) ? (
                          <button
                            type="button"
                            onClick={() => setGrantConfirmTarget(req)}
                            className="action-chip gap-1 text-xs !py-1.5"
                            title={t.adminManualCreditGrant}
                          >
                            <HandCoins className="w-3.5 h-3.5" />
                            {t.adminManualCreditGrant}
                          </button>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}