import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Bitcoin, CheckCircle, Clock, ExternalLink, Loader2 } from 'lucide-react';
import AlertBanner from './ui/AlertBanner';
import { getBinancePayOrderStatus, mapBinancePayError } from '../lib/binancePay';
import { formatMoney } from '../lib/i18n';

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_DURATION_MS = 16 * 60 * 1000; // 16 min guard (orders expire after 15)

/**
 * Binance Pay checkout panel: shows the payment link + a live "waiting for
 * confirmation" spinner that polls our edge for the order status. When the
 * webhook credits the customer balance (status === 'paid'), calls onPaid with
 * the credited amount + fresh balance so the wallet UI updates.
 */
export default function BinancePayPaymentPanel({
  t = {},
  _lang = 'ar',
  order,
  onPaid,
  onExpired,
  _onNotify,
}) {
  const [status, setStatus] = useState(order?.status || 'pending');
  const [checkoutUrl, setCheckoutUrl] = useState(order?.checkoutUrl || '');
  const [polling, setPolling] = useState(true);
  const [error, setError] = useState('');
  const merchantTradeNo = order?.merchantTradeNo || '';
  const requestId = useRef(order?.requestId || null);
  const startedAt = useRef(0);
  const paidRef = useRef(false);

  useEffect(() => {
    if (order?.checkoutUrl) setCheckoutUrl(order.checkoutUrl);
    if (order?.status) setStatus(order.status);
  }, [order?.checkoutUrl, order?.status]);

  useEffect(() => {
    if (!merchantTradeNo) return undefined;
    let cancelled = false;

    if (startedAt.current === 0) startedAt.current = Date.now();

    const tick = async () => {
      if (paidRef.current) return;
      if (Date.now() - startedAt.current > MAX_POLL_DURATION_MS) {
        if (!cancelled) {
          setStatus('expired');
          setPolling(false);
          onExpired?.();
        }
        return;
      }
      try {
        const o = await getBinancePayOrderStatus({ merchantTradeNo });
        if (cancelled || !o) return;
        setStatus(o.status || 'pending');
        if (o.checkoutUrl) setCheckoutUrl(o.checkoutUrl);
        if (o.status === 'paid') {
          paidRef.current = true;
          setPolling(false);
          onPaid?.({
            status: 'paid',
            paidAmount: o.paidAmount,
            creditedAmount: o.creditedAmount ?? o.paidAmount,
            requestedAmount: order?.amount,
            payCurrency: o.currency || 'USDT',
            newBalance: o.newBalance,
            requestId: requestId.current,
            merchantTradeNo,
          });
        } else if (o.status === 'expired' || o.status === 'cancelled' || o.status === 'failed') {
          setPolling(false);
          onExpired?.();
        }
      } catch (err) {
        if (!cancelled) {
          setError(mapBinancePayError(err, t));
        }
      }
    };

    tick();
    const interval = window.setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [merchantTradeNo]);

  const openPayment = () => {
    if (checkoutUrl) window.open(checkoutUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-[#FCD535]/30 bg-[#FCD535]/5 p-5 text-center">
        <div className="flex items-center justify-center gap-2 text-[#FCD535] text-sm font-semibold mb-3">
          <Bitcoin className="w-4 h-4" />
          {t.binance || 'Binance Pay'} (USDT)
        </div>

        <div className="text-3xl font-black font-mono text-[var(--accent)] mb-1">
          {formatMoney(order?.amount)}
        </div>
        <div className="text-xs text-[var(--text-muted)] mb-4">{t.binanceInvoiceHelp}</div>

        {checkoutUrl ? (
          <button
            type="button"
            onClick={openPayment}
            className="btn btn-primary w-full py-3 font-bold inline-flex items-center justify-center gap-2"
          >
            <ExternalLink className="w-4 h-4" />
            {t.binancePayOpen}
          </button>
        ) : (
          <div className="text-sm text-[var(--text-muted)] py-3">{t.binancePayFailed}</div>
        )}

        {polling && status !== 'paid' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[var(--text-sec)]">
            <Loader2 className="w-4 h-4 animate-spin text-[var(--accent)]" />
            {t.binancePayWaiting}
          </div>
        )}

        {status === 'paid' && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-emerald-400">
            <CheckCircle className="w-5 h-5" />
            {t.rechargeSuccess}
          </div>
        )}

        {(status === 'expired' || status === 'cancelled' || status === 'failed') && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-amber-300">
            <Clock className="w-4 h-4" />
            {t.binancePayExpired}
          </div>
        )}
      </div>

      {error && (
        <AlertBanner tone="amber">
          <AlertCircle className="w-4 h-4 inline me-2" />
          {error}
        </AlertBanner>
      )}

      <p className="text-[10px] text-[var(--text-muted)] text-center" dir="auto">
        {t.binancePayInvoiceDesc}
      </p>
    </div>
  );
}