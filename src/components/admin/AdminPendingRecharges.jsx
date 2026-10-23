import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle, HandCoins, RefreshCw, XCircle } from 'lucide-react';
import AdminDashSection from './AdminDashSection';
import AdminProofReceipt from './AdminProofReceipt';
import CopyButton from '../ui/CopyButton';
import ConfirmDialog from '../ui/ConfirmDialog';
import { Spinner } from '../routing/PageLoader';
import {
  approveRechargeRequest,
  fetchAdminRechargeRequests,
  rejectRechargeRequest,
} from '../../lib/recharge';
import { getOrderPaymentMethodLabel } from '../../lib/paymentMethods';
import { formatMessage, formatMoney } from '../../lib/i18n';
import { useNotify } from '../../hooks/useNotify';

const REFRESH_MS = 45000;
const MAX_ROWS = 10;

function sypAmount(req) {
  if (String(req?.pay_currency || '').toUpperCase() !== 'SYP') return null;
  const usd = parseFloat(req?.amount);
  const rate = parseFloat(req?.syp_per_usd_snapshot);
  if (!Number.isFinite(usd) || !Number.isFinite(rate) || rate <= 0) return null;
  return `${Math.round(usd * rate).toLocaleString('en-US')} SYP`;
}

/**
 * Overview card: customers who say they have paid are listed right at the top of the dashboard, with what an admin
 * needs to verify (amount, transaction id, receipt) and Approve / Reject — no digging through other pages.
 */
export default function AdminPendingRecharges({ t = {}, onNotify, onOpenAll }) {
  const { notifyError, notifySuccess } = useNotify(onNotify);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [confirm, setConfirm] = useState(null); // { type: 'approve' | 'reject', req }
  const mounted = useRef(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const result = await fetchAdminRechargeRequests('payment_sent', { limit: MAX_ROWS, offset: 0 });
      if (!mounted.current) return;
      // Oldest first: whoever has waited longest is handled first.
      setRows([...(result.rows || [])].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)));
      setTotal(result.total || 0);
    } catch (err) {
      if (!silent) notifyError(err.message);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [notifyError]);

  useEffect(() => {
    mounted.current = true;
    load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') load({ silent: true });
    }, REFRESH_MS);
    return () => {
      mounted.current = false;
      window.clearInterval(timer);
    };
  }, [load]);

  const run = async () => {
    if (!confirm) return;
    const { type, req } = confirm;
    setProcessingId(req.id);
    try {
      if (type === 'approve') {
        const result = await approveRechargeRequest(req.id);
        notifySuccess(`${t.rechargeApproved} +${formatMoney(result.amount)}`);
      } else {
        await rejectRechargeRequest(req.id, null);
        notifySuccess(t.rechargeRejected);
      }
      setConfirm(null);
      await load({ silent: true });
    } catch (err) {
      notifyError(String(err?.message || '').includes('txn_ref_already_approved')
        ? t.adminRechargeTxnAlreadyApproved
        : err.message);
      setConfirm(null);
    } finally {
      setProcessingId(null);
    }
  };

  const confirmUser = confirm?.req?.user_name || confirm?.req?.username || t.adminUsersUnnamed;
  const confirmAmount = confirm ? formatMoney(confirm.req.amount) : '';

  return (
    <AdminDashSection
      title={t.adminPendingTitle}
      icon={HandCoins}
      action={(
        <div className="flex items-center gap-2">
          {total > 0 && (
            <span className="inline-flex min-w-6 justify-center rounded-full bg-amber-400/20 px-2 py-0.5 text-xs font-black text-amber-200" aria-label={String(total)}>
              {total}
            </span>
          )}
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn btn-secondary p-2 disabled:opacity-60"
            aria-label={t.refresh || 'Refresh'}
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      )}
    >
      {loading && rows.length === 0 ? (
        <div className="py-6 text-center"><Spinner size="md" className="mx-auto text-[var(--accent)]" /></div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)] py-1">{t.adminPendingEmpty}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((req) => {
            const syp = sypAmount(req);
            const busy = processingId === req.id;
            return (
              <li key={req.id} className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]/60 p-3 sm:p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                  <div className="min-w-0">
                    <div className="font-bold text-sm truncate">
                      {req.user_name || t.adminUsersUnnamed}
                      {req.username ? (
                        <span className="ms-2 text-[11px] font-mono font-normal text-[var(--text-muted)]" dir="ltr">@{req.username}</span>
                      ) : null}
                    </div>
                    <div className="text-xs text-[var(--text-sec)]">{getOrderPaymentMethodLabel(req.payment_method, t)}</div>
                  </div>
                  <div className="text-end">
                    <div className="font-mono font-black text-lg text-[var(--accent)]" dir="ltr">{formatMoney(req.amount)}</div>
                    {syp && <div className="text-[11px] font-mono text-[var(--text-sec)]" dir="ltr">{syp}</div>}
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  {req.reference && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-muted)]">{t.adminRechargeReference}</span>
                      <span className="font-mono break-all text-[var(--text-sec)]" dir="ltr">{req.reference}</span>
                    </div>
                  )}
                  {req.payment_txn_ref && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-muted)]">{t.adminRechargeTxnRef}</span>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="font-mono break-all" dir="ltr">{req.payment_txn_ref}</span>
                        <CopyButton value={req.payment_txn_ref} label={t.copyCode || 'Copy'} copiedLabel={t.copied || 'Copied'} />
                      </span>
                    </div>
                  )}
                  {req.payment_proof_path && <AdminProofReceipt path={req.payment_proof_path} t={t} compact />}
                </div>

                {req.txn_ref_conflict && (
                  <div className="rounded-xl border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-200 leading-relaxed" role="alert">
                    {t.adminRechargeTxnConflict}
                  </div>
                )}
                {req.payment_method === 'ShamCashManual' && (
                  <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 leading-relaxed">
                    {formatMessage(t.adminRechargeVerifyHint, { reference: req.reference || '' })}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ type: 'approve', req })}
                    className="btn btn-primary py-2.5 text-sm inline-flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <CheckCircle className="w-4 h-4" aria-hidden="true" />
                    {t.approveRecharge}
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ type: 'reject', req })}
                    className="btn btn-secondary py-2.5 text-sm inline-flex items-center justify-center gap-1.5 text-red-300 disabled:opacity-60"
                  >
                    <XCircle className="w-4 h-4" aria-hidden="true" />
                    {t.rejectRecharge}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {total > rows.length || rows.length > 0 ? (
        <div className="pt-3">
          <button type="button" onClick={onOpenAll} className="text-xs text-[var(--accent)] underline underline-offset-2">
            {t.adminPendingOpenAll}
          </button>
        </div>
      ) : null}

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.type === 'approve' ? t.adminPendingApproveTitle : t.adminPendingRejectTitle}
        message={confirm
          ? formatMessage(confirm.type === 'approve' ? t.adminPendingApproveBody : t.adminPendingRejectBody, {
            amount: confirmAmount,
            user: confirmUser,
          })
          : ''}
        confirmLabel={confirm?.type === 'approve' ? t.approveRecharge : t.rejectRecharge}
        cancelLabel={t.cancel}
        variant={confirm?.type === 'approve' ? 'primary' : 'danger'}
        loading={!!processingId}
        onConfirm={run}
        onCancel={() => setConfirm(null)}
      />
    </AdminDashSection>
  );
}
