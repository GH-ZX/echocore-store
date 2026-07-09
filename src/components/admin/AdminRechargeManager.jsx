import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, CheckCircle, XCircle, RefreshCw, Wallet } from 'lucide-react';
import {
  fetchAdminRechargeRequests,
  approveRechargeRequest,
  rejectRechargeRequest,
} from '../../lib/recharge';

export default function AdminRechargeManager({ t = {}, lang = 'ar', onApproved, onNotify }) {
  const isAr = lang === 'ar';
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
  const [filter, setFilter] = useState('payment_sent');
  const [requests, setRequests] = useState([]);
  const loadInFlightRef = useRef(false);

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
        `${t.rechargeApproved || (isAr ? 'تمت الموافقة على الشحن' : 'Recharge approved')} +$${parseFloat(result.amount).toFixed(2)}`,
      );
      onApproved?.(result);
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
      notifySuccess(t.rechargeRejected || (isAr ? 'تم رفض طلب الشحن' : 'Recharge request rejected'));
      await load();
    } catch (err) {
      notifyError(err.message);
    } finally {
      setProcessingId(null);
    }
  };

  const statusLabel = (status) => {
    const map = {
      pending: isAr ? 'جديد' : 'New',
      payment_sent: isAr ? 'بانتظار الموافقة' : 'Awaiting approval',
      approved: isAr ? 'موافق عليه' : 'Approved',
      rejected: isAr ? 'مرفوض' : 'Rejected',
    };
    return map[status] || status;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-black flex items-center gap-2">
            <Wallet className="w-5 h-5 text-green-400" />
            {t.rechargeQueue || (isAr ? 'طلبات شحن الرصيد' : 'Recharge Requests')}
          </h2>
          <p className="text-sm text-[var(--text-sec)] mt-1">
            {t.rechargeQueueHelp
              || (isAr ? 'وافق على الطلبات بعد التحقق من استلام المبلغ في ShamCash.' : 'Approve requests after verifying ShamCash payment.')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl px-3 py-2 text-sm outline-none"
          >
            <option value="payment_sent">{isAr ? 'بانتظار الموافقة' : 'Awaiting approval'}</option>
            <option value="pending">{isAr ? 'جديدة' : 'New'}</option>
            <option value="approved">{isAr ? 'موافق عليها' : 'Approved'}</option>
            <option value="rejected">{isAr ? 'مرفوضة' : 'Rejected'}</option>
            <option value="all">{isAr ? 'الكل' : 'All'}</option>
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
          {t.noRechargeRequests || (isAr ? 'لا توجد طلبات شحن.' : 'No recharge requests.')}
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map((req) => {
            const canReview = req.status === 'pending' || req.status === 'payment_sent';
            const busy = processingId === req.id;

            return (
              <div key={req.id} className="card p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-bold text-lg font-mono text-[var(--accent)]">
                      ${parseFloat(req.amount).toFixed(2)}
                    </div>
                    <div className="text-sm text-[var(--text-sec)] mt-1">
                      {req.user_name || (isAr ? 'مستخدم' : 'User')} · <span className="font-mono text-xs">{req.user_id?.slice(0, 8)}…</span>
                    </div>
                    <div className="font-mono text-xs text-[var(--text-muted)] mt-1 break-all">{req.reference}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-2">
                      {new Date(req.created_at).toLocaleString(isAr ? 'ar' : 'en')}
                      {' · '}
                      <span className="uppercase tracking-wide">{statusLabel(req.status)}</span>
                    </div>
                  </div>

                  {canReview && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleApprove(req.id)}
                        disabled={busy}
                        className="btn btn-primary action-chip gap-1.5 !border-0 text-sm"
                      >
                        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                        {t.approveRecharge || (isAr ? 'موافقة' : 'Approve')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReject(req.id)}
                        disabled={busy}
                        className="action-chip gap-1.5 text-red-400 border-red-500/30 hover:bg-red-500/10 text-sm"
                      >
                        <XCircle className="w-4 h-4" />
                        {t.rejectRecharge || (isAr ? 'رفض' : 'Reject')}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}