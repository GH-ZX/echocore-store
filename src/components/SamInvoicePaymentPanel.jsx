import { useState, useEffect, useCallback, useRef } from 'react';
import { ExternalLink, Loader2, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { verifyOrderInvoice, getSamInvoiceStatus } from '../lib/samApi';
import { formatInvoicePayLabel } from '../lib/rechargeCurrency';
import { formatMessage } from '../lib/i18n';
import { closeSamPaymentWindow, openSamPaymentWindow } from '../lib/samPaymentPopup';

const POLL_MS = 4000;

export default function SamInvoicePaymentPanel({
  t = {},
  lang = 'ar',
  total,
  methodLabel,
  invoice,
  onPaid,
  onExpired,
  onNotify,
  paidRedirectKey = 'samInvoiceRedirecting',
  expiredDescKey = 'samInvoiceExpiredDesc',
  autoConfirmNoteKey = 'samInvoiceAutoConfirmNote',
  autoOpenPaymentPopup = false,
}) {
  const notifyError = useCallback((message) => onNotify?.(message, 'error'), [onNotify]);
  const notifySuccess = useCallback((message) => onNotify?.(message, 'success'), [onNotify]);

  const [transactionRef, setTransactionRef] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [status, setStatus] = useState(invoice?.status || 'pending');
  const [entityStatus, setEntityStatus] = useState(null);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const paymentPopupRef = useRef(null);

  const samInvoiceId = invoice?.samInvoiceId;
  const paymentUrl = invoice?.paymentUrl;
  const payCurrency = invoice?.currency || 'USD';
  const payAmount = invoice?.amount ?? total;
  const displayPayAmount = formatInvoicePayLabel({
    currency: payCurrency,
    amount: payAmount,
    usdAmount: invoice?.requestedUsdAmount,
  });

  const handlePaid = useCallback((completion) => {
    closeSamPaymentWindow(paymentPopupRef.current);
    paymentPopupRef.current = null;
    setStatus('paid');
    notifySuccess(t.samInvoicePaymentConfirmed);
    onPaid?.(completion);
  }, [onPaid, notifySuccess, t.samInvoicePaymentConfirmed]);

  const handleExpired = useCallback(() => {
    closeSamPaymentWindow(paymentPopupRef.current);
    paymentPopupRef.current = null;
    setStatus('expired');
    notifyError(t.samInvoiceExpired);
    onExpired?.();
  }, [onExpired, notifyError, t.samInvoiceExpired]);

  const pollStatus = useCallback(async () => {
    if (!samInvoiceId || status === 'paid' || status === 'expired') return;

    try {
      const result = await getSamInvoiceStatus(samInvoiceId);
      if (
        result.status === 'paid'
        || result.orderStatus === 'completed'
        || result.rechargeStatus === 'approved'
      ) {
        handlePaid(result.completion);
        return;
      }
      if (result.status === 'expired') {
        handleExpired();
        return;
      }
      if (result.orderStatus || result.rechargeStatus) {
        setEntityStatus(result.orderStatus || result.rechargeStatus);
      }
    } catch {
      /* polling is best-effort */
    }
  }, [samInvoiceId, status, handlePaid, handleExpired]);

  useEffect(() => {
    if (!samInvoiceId || status === 'paid' || status === 'expired') return undefined;

    const id = setInterval(pollStatus, POLL_MS);
    pollStatus();

    return () => clearInterval(id);
  }, [samInvoiceId, status, pollStatus]);

  useEffect(() => {
    if (!autoOpenPaymentPopup || !paymentUrl || status === 'paid' || status === 'expired') {
      return undefined;
    }

    if (paymentPopupRef.current && !paymentPopupRef.current.closed) {
      return undefined;
    }

    const popup = openSamPaymentWindow(paymentUrl);
    paymentPopupRef.current = popup;
    setPopupBlocked(!popup);
  }, [autoOpenPaymentPopup, paymentUrl, status]);

  useEffect(() => () => {
    closeSamPaymentWindow(paymentPopupRef.current);
    paymentPopupRef.current = null;
  }, []);

  const handleVerify = async () => {
    const ref = transactionRef.trim();
    if (!ref || !samInvoiceId) return;

    setVerifying(true);
    try {
      const result = await verifyOrderInvoice(samInvoiceId, ref);
      if (result.verified) {
        handlePaid(result.completion);
      } else {
        notifyError(result.message || t.samInvoiceVerifyFailed);
      }
    } catch (e) {
      const msg = e.message || '';
      if (/EXPIRED/i.test(msg)) {
        handleExpired();
      } else {
        notifyError(msg || t.samInvoiceVerifyFailed);
      }
    } finally {
      setVerifying(false);
    }
  };

  const openPaymentPage = () => {
    if (!paymentUrl) return;
    const popup = openSamPaymentWindow(paymentUrl);
    paymentPopupRef.current = popup;
    setPopupBlocked(!popup);
    if (!popup) notifyError(t.samPaymentPopupBlocked);
  };

  if (status === 'paid' || entityStatus === 'completed' || entityStatus === 'approved') {
    return (
      <div className="text-center py-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
        <CheckCircle className="w-10 h-10 mx-auto text-emerald-400 mb-3" />
        <div className="font-bold text-emerald-100">{t.samInvoicePaymentConfirmed}</div>
        <p className="text-xs text-[var(--text-sec)] mt-2">{t[paidRedirectKey]}</p>
        <Loader2 className="w-5 h-5 mx-auto animate-spin text-emerald-300 mt-3" />
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="text-center py-6 rounded-2xl border border-red-500/30 bg-red-500/10">
        <AlertCircle className="w-10 h-10 mx-auto text-red-300 mb-3" />
        <div className="font-bold text-red-100">{t.samInvoiceExpired}</div>
        <p className="text-xs text-[var(--text-sec)] mt-2 max-w-sm mx-auto">{t[expiredDescKey]}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-center">
        <p className="text-sm text-[var(--text-sec)] mb-4 leading-relaxed">
          {autoOpenPaymentPopup
            ? t.samPaymentPopupOpened
            : formatMessage(t.samInvoicePayDesc, { method: methodLabel, amount: displayPayAmount })}
        </p>

        {paymentUrl ? (
          <>
            {autoOpenPaymentPopup && (
              <p className="text-xs text-[var(--text-muted)] mb-4 flex items-center justify-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                {t.samPaymentWaitingInPopup}
              </p>
            )}
            <button
              type="button"
              onClick={openPaymentPage}
              className="btn btn-primary w-full py-4 font-bold inline-flex items-center justify-center gap-2"
            >
              <ExternalLink className="w-4 h-4" />
              {popupBlocked ? t.samInvoiceOpenPaymentPage : t.samPaymentReopenPopup}
            </button>
          </>
        ) : (
          <div className="py-4 text-sm text-[var(--text-muted)]">{t.samInvoiceUnavailable}</div>
        )}

        {invoice?.expiresAt && (
          <p className="text-[10px] text-[var(--text-muted)] mt-3 flex items-center justify-center gap-1">
            <Clock className="w-3 h-3" />
            {formatMessage(t.samInvoiceExpiresAt, {
              time: new Date(invoice.expiresAt).toLocaleTimeString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US', {
                hour: '2-digit',
                minute: '2-digit',
              }),
            })}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4">
        <label className="text-xs text-[var(--text-muted)] block mb-2">
          {t.samInvoiceTransactionRefLabel}
        </label>
        <input
          type="text"
          value={transactionRef}
          onChange={(e) => setTransactionRef(e.target.value)}
          placeholder={t.samInvoiceTransactionRefPlaceholder}
          className="w-full rounded-xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 font-mono text-sm focus:border-[var(--accent)] outline-none mb-3"
        />
        <p className="text-[10px] text-[var(--text-muted)] mb-3">{t.samInvoiceTransactionRefHint}</p>
        <button
          type="button"
          onClick={handleVerify}
          disabled={verifying || !transactionRef.trim()}
          className="btn btn-secondary w-full py-3 font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {verifying ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> {t.samInvoiceVerifying}</>
          ) : (
            t.samInvoiceVerifyPayment
          )}
        </button>
      </div>

      <p className="text-center text-[10px] text-[var(--text-muted)]">{t[autoConfirmNoteKey]}</p>
    </div>
  );
}