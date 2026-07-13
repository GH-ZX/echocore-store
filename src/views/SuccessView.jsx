import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Copy,
  Check,
  Loader2,
  Receipt,
  KeyRound,
  UserRound,
  Clock,
  XCircle,
  AlertTriangle,
  Gift,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  formatOrderDisplayId,
  extractDeliveryCodes,
  getOrderReceiptPresentation,
  getOrderStatusLabel,
  shouldTriggerFulfillment,
  isOrderPaid,
} from '../lib/orderReceipt';

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const TONE_STYLES = {
  success: {
    card: 'border-emerald-500/20 bg-emerald-500/5',
    iconWrap: 'bg-emerald-500/15 text-emerald-400',
    label: 'text-emerald-400/90',
  },
  warning: {
    card: 'border-amber-500/25 bg-amber-500/5',
    iconWrap: 'bg-amber-500/15 text-amber-300',
    label: 'text-amber-300/90',
  },
  danger: {
    card: 'border-red-500/25 bg-red-500/5',
    iconWrap: 'bg-red-500/15 text-red-300',
    label: 'text-red-300/90',
  },
  info: {
    card: 'border-[var(--border)] bg-[var(--bg-surface)]/40',
    iconWrap: 'bg-[var(--accent)]/15 text-[var(--accent)]',
    label: 'text-[var(--text-muted)]',
  },
};

function HeaderIcon({ tone, fulfillmentFailed }) {
  if (tone === 'danger') return <XCircle className="w-7 h-7" strokeWidth={2} />;
  if (tone === 'warning') return <Clock className="w-7 h-7" strokeWidth={2} />;
  if (fulfillmentFailed) return <AlertTriangle className="w-7 h-7" strokeWidth={2} />;
  return <Receipt className="w-7 h-7" strokeWidth={2} />;
}

export default function SuccessView({
  navigate,
  t = {},
  lang = 'ar',
  onFulfillOrder,
}) {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);
  const fulfillStarted = useRef(false);

  const loadOrder = useCallback(async () => {
    if (!orderId) return null;

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    const { data: items } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId);

    setOrderDetails(order || null);
    setOrderItems(items || []);
    return { order, items: items || [] };
  }, [orderId]);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return undefined;
    }

    let cancelled = false;
    let pollTimer = null;

    const run = async () => {
      try {
        const result = await loadOrder();
        if (cancelled || !result?.order) return;

        const codes = extractDeliveryCodes(result.items);
        const fs = result.order.fulfillment_status;
        const shouldPoll = isOrderPaid(result.order)
          && ['pending', 'fulfilling', 'processing'].includes(fs || 'pending')
          && codes.length === 0;

        if (shouldPoll) {
          pollTimer = setTimeout(run, 3000);
        }
      } catch (err) {
        console.error('Fetch order error:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setLoading(true);
    run();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [orderId, loadOrder]);

  useEffect(() => {
    if (!orderDetails || !orderId || fulfillStarted.current) return;
    if (!shouldTriggerFulfillment(orderDetails) || !onFulfillOrder) return;

    fulfillStarted.current = true;
    onFulfillOrder(orderId)
      .then(() => loadOrder())
      .catch((err) => {
        console.error('Order fulfillment:', err);
        fulfillStarted.current = false;
      });
  }, [orderDetails, orderId, onFulfillOrder, loadOrder]);

  const handleCopy = async (text, key) => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto mb-3" />
        <p className="text-[var(--text-sec)]">{t.loadingOrderDetails}</p>
      </div>
    );
  }

  if (!orderDetails) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-xl text-[var(--text-sec)]">{t.orderNotFound}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-4">
          {t.backToHome}
        </button>
      </div>
    );
  }

  const firstItem = orderItems[0] || {};
  const playerUid = firstItem.player_uid;
  const playerServer = firstItem.player_server;
  const playerCharname = firstItem.player_charname;
  const hasUid = !!playerUid;
  const deliveryCodes = extractDeliveryCodes(orderItems);
  const hasCodes = deliveryCodes.length > 0;
  const fulfillmentStatus = orderDetails.fulfillment_status || 'pending';
  const presentation = getOrderReceiptPresentation(orderDetails, t);
  const tone = presentation.tone;
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.info;
  const balanceRefunded = orderDetails?.g2bulk_metadata?.balance_refunded === true;
  const fulfillmentFailed = isOrderPaid(orderDetails) && fulfillmentStatus === 'failed';
  const isAwaitingFulfillment = isOrderPaid(orderDetails)
    && !hasCodes
    && !fulfillmentFailed
    && ['pending', 'fulfilling', 'processing'].includes(fulfillmentStatus);
  const isPreparingCodes = isOrderPaid(orderDetails)
    && !hasCodes
    && !hasUid
    && (fulfillmentStatus === 'fulfilling' || fulfillmentStatus === 'pending');
  const showTopupDetails = isOrderPaid(orderDetails) && hasUid && fulfillmentStatus === 'fulfilled';
  const allCodesText = deliveryCodes.join('\n');

  if (isAwaitingFulfillment) {
    return (
      <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
        <div className="card p-8 sm:p-10 text-center border border-[var(--accent)]/20 bg-[var(--bg-surface)]/60">
          <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)] mx-auto mb-4" />
          <h1 className="text-2xl sm:text-3xl font-black mb-2">
            {t.orderProcessingTitle || 'Your order is being processed'}
          </h1>
          <p className="text-[var(--text-sec)] max-w-xl mx-auto leading-relaxed">
            {t.orderProcessingSubtitle || 'We are waiting for G2Bulk to confirm the delivery or top-up result for this purchase.'}
          </p>
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)]">
            <Clock className="w-4 h-4" />
            #{formatOrderDisplayId(orderDetails)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
      <div className={`card p-6 sm:p-8 mb-6 border ${toneStyle.card}`}>
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${toneStyle.iconWrap}`}>
            <HeaderIcon tone={tone} fulfillmentFailed={fulfillmentFailed} />
          </div>
          <div className="flex-1 min-w-0">
            <p className={`text-xs uppercase tracking-wider font-bold mb-1 ${toneStyle.label}`}>
              {t.orderReceiptLabel}
            </p>
            <h1 className="text-2xl sm:text-3xl font-black">{presentation.title}</h1>
            <p className="text-[var(--text-sec)] text-sm mt-1">{presentation.subtitle}</p>
            <p className="text-xs text-[var(--text-muted)] mt-2 font-mono">
              #{formatOrderDisplayId(orderDetails)}
            </p>
          </div>
        </div>
      </div>

      {orderDetails.payment_method === 'admin_gift' && orderDetails.gift_message && (
        <div className="card p-6 mb-6 border border-pink-500/25 bg-gradient-to-br from-pink-500/10 via-[var(--bg-surface)] to-violet-500/5">
          <div className="flex items-start gap-3">
            <div className="w-11 h-11 rounded-2xl bg-pink-500/15 text-pink-300 flex items-center justify-center shrink-0">
              <Gift className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <div className="text-xs uppercase tracking-wider font-bold text-pink-200/80 mb-1">
                {t.giftMessageLabel}
              </div>
              <p className="text-base sm:text-lg font-semibold leading-relaxed text-white/95 whitespace-pre-wrap">
                {orderDetails.gift_message}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">{t.orderInfo}</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.orderIdLabel}</div>
            <div className="font-mono text-xs break-all">{orderDetails.id}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.total}</div>
            <div className="font-bold text-lg text-[var(--accent)]">
              ${parseFloat(orderDetails.total).toFixed(2)}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.orderPaymentMethodLabel}</div>
            <div>
              {orderDetails.payment_method === 'balance'
                ? t.payFromBalance
                : orderDetails.payment_method === 'admin_gift'
                  ? t.orderPaymentGift
                  : orderDetails.payment_method}
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.orderStatusLabel}</div>
            <div>{getOrderStatusLabel(orderDetails.status, t)}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3 sm:col-span-2">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.date}</div>
            <div>{new Date(orderDetails.created_at).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US')}</div>
          </div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">{t.itemsPurchased}</h2>
        {orderItems.length > 0 ? (
          <div className="space-y-2">
            {orderItems.map((item) => (
              <div
                key={item.id || `${item.name_snapshot}-${item.price}`}
                className="flex justify-between text-sm py-2 border-b border-[var(--border)] last:border-0"
              >
                <span>{item.name_snapshot}</span>
                <span className="font-mono">
                  ${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-sec)]">{t.noItems}</p>
        )}
      </div>

      {hasCodes && (
        <div className="card p-6 mb-6 border border-[var(--accent)]/25">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="font-bold text-lg flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-[var(--accent)]" />
              {t.yourRedeemCode}
            </h2>
            {deliveryCodes.length > 1 && (
              <button
                type="button"
                onClick={() => handleCopy(allCodesText, 'all')}
                className="btn btn-secondary text-xs py-2 px-3"
              >
                {copiedKey === 'all' ? t.copied : t.copyAllCodes}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {deliveryCodes.map((code, idx) => (
              <div key={`${code}-${idx}`} className="bg-[var(--bg-primary)] p-4 rounded-xl flex items-center gap-3">
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="text-xl sm:text-2xl font-mono tracking-wide text-[var(--accent)] break-all">
                    {code}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(code, `code-${idx}`)}
                  className="header-btn header-btn-icon flex-shrink-0"
                  title={t.copyCode}
                >
                  {copiedKey === `code-${idx}` ? (
                    <Check className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[var(--text-sec)] text-sm mt-4">{t.useCodeInGame}</p>
        </div>
      )}

      {showTopupDetails && (
        <div className="card p-6 mb-6 border border-emerald-500/25 bg-emerald-500/5">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2 text-emerald-400">
            <UserRound className="w-5 h-5" />
            {t.topUpSentSuccess || 'Top-up request received'}
          </h2>
          <p className="text-[var(--text-sec)] text-sm mb-4">{t.topUpSentDesc || 'Your top-up request is ready for delivery to the recipient below.'}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
              <div className="text-[var(--text-muted)] text-xs mb-1">{t.playerUidLabel || 'Player ID'}</div>
              <div className="font-mono text-[var(--accent)] text-lg break-all">{playerUid}</div>
            </div>
            {playerServer && (
              <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
                <div className="text-[var(--text-muted)] text-xs mb-1">{t.serverLabel}</div>
                <div className="font-mono">{playerServer}</div>
              </div>
            )}
            {playerCharname && (
              <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
                <div className="text-[var(--text-muted)] text-xs mb-1">{t.charnameLabel}</div>
                <div className="font-mono">{playerCharname}</div>
              </div>
            )}
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
              <div className="text-[var(--text-muted)] text-xs mb-1">{t.total}</div>
              <div className="font-semibold">${parseFloat(orderDetails.total).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
              <div className="text-[var(--text-muted)] text-xs mb-1">{t.date}</div>
              <div>{new Date(orderDetails.created_at).toLocaleString(lang === 'ar' ? 'ar-SY' : 'en-US')}</div>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">{t.topUpArrivesSoon || 'The delivery will be processed shortly after payment confirmation.'}</p>
        </div>
      )}

      {isPreparingCodes && (
        <div className="card p-6 mb-6 text-center text-[var(--text-sec)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto mb-2" />
          <p>{t.orderPreparingCodes}</p>
        </div>
      )}

      {fulfillmentFailed && (
        <div className={`card p-6 mb-6 text-center border ${balanceRefunded ? 'border-amber-500/30 bg-amber-500/5 text-amber-200' : 'border-red-500/30 bg-red-500/5 text-red-300'}`}>
          <p>{balanceRefunded ? t.orderFulfillmentRefundedSupport : t.orderFulfillmentFailedSupport}</p>
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button type="button" onClick={() => navigate('/profile')} className="btn btn-secondary px-6 py-3">
          {t.myOrdersLink}
        </button>
        <button type="button" onClick={() => navigate('/')} className="btn btn-primary px-8 py-3">
          {t.backToHomeSuccess || t.backToHome}
        </button>
      </div>
    </div>
  );
}