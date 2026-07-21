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
  MessageSquareHeart,
} from 'lucide-react';
import { fetchMyOrderReceipt } from '../lib/orders';
import CustomerReviewForm from '../components/reviews/CustomerReviewForm';
import {
  canUserAccessOrderReceipt,
  consumeOrderFulfillMarker,
  isValidOrderUuid,
} from '../lib/orderAccess';
import {
  formatOrderDisplayId,
  formatOrderItemDisplayName,
  extractDeliveryCodes,
  getFulfillmentFailureMessage,
  getOrderReceiptPresentation,
  getOrderStatusLabel,
  getOrderTopupDeliveryDetails,
  shouldTriggerFulfillment,
  isOrderPaid,
} from '../lib/orderReceipt';
import { INVOICE_KIND } from '../lib/invoiceBuilder';

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
  if (tone === 'success') return <Check className="w-7 h-7" strokeWidth={2.5} />;
  return <Receipt className="w-7 h-7" strokeWidth={2} />;
}

/** How long to keep retrying before treating a missing receipt as not found. */
const ORDER_LOOKUP_MAX_MS = 45_000;
const ORDER_LOOKUP_POLL_MS = 1_500;
const FULFILLMENT_POLL_MS = 3_000;
/** Keep polling for codes after payment while supplier delivers. */
const FULFILLMENT_POLL_MAX_MS = 10 * 60_000;
/** Re-attempt supplier fulfill when customer re-opens a stuck paid order. */
const STUCK_FULFILL_RETRY_AFTER_MS = 60_000;

function getOrderAgeMs(order) {
  if (!order?.created_at) return Number.POSITIVE_INFINITY;
  const ts = new Date(order.created_at).getTime();
  if (!Number.isFinite(ts)) return Number.POSITIVE_INFINITY;
  return Math.max(0, Date.now() - ts);
}

function WaitingOrderCard({ orderRef, title, subtitle }) {
  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
      <div className="card p-8 sm:p-10 text-center border border-[var(--accent)]/20 bg-[var(--bg-surface)]/60">
        <Loader2 className="w-10 h-10 animate-spin text-[var(--accent)] mx-auto mb-4" />
        <h1 className="text-2xl sm:text-3xl font-black mb-2">
          {title}
        </h1>
        <p className="text-[var(--text-sec)] max-w-xl mx-auto leading-relaxed">
          {subtitle}
        </p>
        {orderRef ? (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-[var(--border)] px-3 py-2 text-sm text-[var(--text-muted)]">
            <Clock className="w-4 h-4" />
            #{orderRef}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function SuccessView({
  navigate,
  t = {},
  lang = 'ar',
  user,
  onFulfillOrder,
}) {
  const [searchParams] = useSearchParams();
  const rawOrderId = searchParams.get('orderId');
  const orderId = isValidOrderUuid(rawOrderId) ? rawOrderId.trim() : null;
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  /** true until first successful receipt or lookup timeout */
  const [loading, setLoading] = useState(true);
  /** only true after retries exhausted with no readable order */
  const [lookupFailed, setLookupFailed] = useState(false);
  const [lookupError, setLookupError] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const fulfillStarted = useRef(false);

  const userId = user?.id || null;
  const userRole = user?.role || null;

  const loadOrder = useCallback(async () => {
    if (!orderId || !userId) return null;

    const receipt = await fetchMyOrderReceipt(orderId);
    const order = receipt?.order || null;
    const items = receipt?.items || [];

    // Stable access principal — avoid depending on whole `user` object (balance churn)
    const principal = { id: userId, role: userRole };
    if (!canUserAccessOrderReceipt(order, principal)) {
      setOrderDetails(null);
      setOrderItems([]);
      return { order: null, items: [] };
    }

    setOrderDetails(order);
    setOrderItems(items);
    setLookupError(null);
    return { order, items };
  }, [orderId, userId, userRole]);

  useEffect(() => {
    // Invalid / missing id → not found (no point polling)
    if (!orderId) {
      setLoading(false);
      setLookupFailed(true);
      setLookupError(null);
      setOrderDetails(null);
      setOrderItems([]);
      return undefined;
    }

    // Auth still hydrating: stay on waiting UI, do not flash "not found"
    if (!userId) {
      setLoading(true);
      setLookupFailed(false);
      return undefined;
    }

    let cancelled = false;
    let pollTimer = null;
    const startedAt = Date.now();
    let initialLoadDone = false;

    const schedule = (ms) => {
      if (cancelled) return;
      pollTimer = setTimeout(run, ms);
    };

    const run = async () => {
      try {
        const result = await loadOrder();
        if (cancelled) return;

        if (!result?.order) {
          if (Date.now() - startedAt < ORDER_LOOKUP_MAX_MS) {
            // Only show full-page spinner while we have never loaded an order
            if (!initialLoadDone) {
              setLoading(true);
              setLookupFailed(false);
            }
            schedule(ORDER_LOOKUP_POLL_MS);
            return;
          }
          if (!initialLoadDone) {
            setOrderDetails(null);
            setOrderItems([]);
            setLookupFailed(true);
            setLoading(false);
          }
          return;
        }

        initialLoadDone = true;
        setLookupFailed(false);
        setLoading(false);

        const codes = extractDeliveryCodes(result.items, result.order.g2bulk_metadata);
        const fs = result.order.fulfillment_status || 'pending';
        const fulfillmentDone = fs === 'fulfilled' || fs === 'skipped' || fs === 'failed';
        const shouldPollFulfillment = isOrderPaid(result.order)
          && !fulfillmentDone
          && ['pending', 'fulfilling', 'processing'].includes(fs)
          && codes.length === 0
          && Date.now() - startedAt < FULFILLMENT_POLL_MAX_MS;

        if (shouldPollFulfillment) {
          schedule(FULFILLMENT_POLL_MS);
        }
      } catch (err) {
        console.error('Fetch order error:', err);
        if (cancelled) return;
        setLookupError(err?.message || String(err));
        // Transient RPC/network errors: keep waiting, same as missing order
        if (Date.now() - startedAt < ORDER_LOOKUP_MAX_MS) {
          if (!initialLoadDone) {
            setLoading(true);
            setLookupFailed(false);
          }
          schedule(ORDER_LOOKUP_POLL_MS);
          return;
        }
        if (!initialLoadDone) {
          setLookupFailed(true);
          setLoading(false);
        }
      }
    };

    // Only reset loading when orderId/user identity changes — not on every poll tick
    setLoading(true);
    setLookupFailed(false);
    setLookupError(null);
    fulfillStarted.current = false;
    run();

    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [orderId, userId, loadOrder]);

  useEffect(() => {
    if (!orderDetails || !orderId || fulfillStarted.current || !userId) return;
    if (!canUserAccessOrderReceipt(orderDetails, { id: userId, role: userRole })) return;
    if (!shouldTriggerFulfillment(orderDetails) || !onFulfillOrder) return;

    const hasCheckoutMarker = consumeOrderFulfillMarker(orderId);
    const ageMs = getOrderAgeMs(orderDetails);
    const fs = orderDetails.fulfillment_status || 'pending';
    const stuckRetry = isOrderPaid(orderDetails)
      && (fs === 'pending' || fs === 'fulfilling' || fs === 'failed')
      && ageMs >= STUCK_FULFILL_RETRY_AFTER_MS;

    // Fresh checkout tab: marker. Re-open from notif / later: retry stuck delivery.
    if (!hasCheckoutMarker && !stuckRetry) return;

    fulfillStarted.current = true;
    onFulfillOrder(orderId)
      .then(() => loadOrder())
      .catch((err) => {
        console.error('Order fulfillment:', err);
        fulfillStarted.current = false;
      });
  }, [orderDetails, orderId, userId, userRole, onFulfillOrder, loadOrder]);

  const handleCopy = async (text, key) => {
    const ok = await copyText(text);
    if (!ok) return;
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const shortOrderRef = orderId ? orderId.slice(0, 8) : null;

  // Looking up order (not the same as "delivery preparing")
  if (loading || (orderId && !orderDetails && !lookupFailed)) {
    return (
      <WaitingOrderCard
        orderRef={shortOrderRef}
        title={t.loadingOrderDetails || t.orderProcessingTitle}
        subtitle={t.orderProcessingSubtitle}
      />
    );
  }

  if (!orderDetails) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <p className="text-xl text-[var(--text-sec)]">{t.orderNotFound}</p>
        {lookupError ? (
          <p className="text-sm text-[var(--text-muted)] mt-2 font-mono break-all" dir="ltr">
            {lookupError}
          </p>
        ) : null}
        {orderId ? (
          <p className="text-xs text-[var(--text-muted)] mt-2 font-mono" dir="ltr">
            #{shortOrderRef}
          </p>
        ) : null}
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLookupFailed(false);
              setLookupError(null);
              loadOrder()
                .then((r) => {
                  if (!r?.order) {
                    setLookupFailed(true);
                    setLoading(false);
                  } else {
                    setLoading(false);
                  }
                })
                .catch((err) => {
                  setLookupError(err?.message || String(err));
                  setLookupFailed(true);
                  setLoading(false);
                });
            }}
            className="btn btn-primary"
          >
            {t.refresh}
          </button>
          <button type="button" onClick={() => navigate('/profile')} className="btn btn-secondary">
            {t.myOrdersLink}
          </button>
          <button type="button" onClick={() => navigate('/')} className="btn btn-secondary">
            {t.backToHome}
          </button>
        </div>
      </div>
    );
  }

  const firstItem = orderItems[0] || {};
  const topup = getOrderTopupDeliveryDetails(orderDetails, orderItems);
  const playerUid = topup.playerUid || firstItem.player_uid;
  const playerServer = topup.playerServer || firstItem.player_server;
  const playerCharname = topup.playerCharname || firstItem.player_charname;
  const hasUid = !!playerUid;
  // Match invoices: codes may live on items and/or order.g2bulk_metadata
  const deliveryCodes = extractDeliveryCodes(orderItems, orderDetails.g2bulk_metadata);
  const hasCodes = deliveryCodes.length > 0;
  const fulfillmentStatus = orderDetails.fulfillment_status || 'pending';
  const presentation = getOrderReceiptPresentation(orderDetails, t);
  const tone = presentation.tone;
  const toneStyle = TONE_STYLES[tone] || TONE_STYLES.info;
  const balanceRefunded = orderDetails?.g2bulk_metadata?.balance_refunded === true;
  const fulfillmentFailed = isOrderPaid(orderDetails) && fulfillmentStatus === 'failed';
  const fulfillmentDone = fulfillmentStatus === 'fulfilled' || fulfillmentStatus === 'skipped';
  // Never full-page block after order loads — always show paid receipt shell.
  // Codes / top-up details appear when ready; otherwise inline "preparing".
  const stillDelivering = isOrderPaid(orderDetails)
    && !hasCodes
    && !fulfillmentDone
    && !fulfillmentFailed
    && ['pending', 'fulfilling', 'processing'].includes(fulfillmentStatus);
  // Inline banner for any paid order still waiting on supplier (codes or UID top-up)
  const isPreparingCodes = stillDelivering;
  const showTopupDetails = isOrderPaid(orderDetails) && hasUid && fulfillmentDone;
  const allCodesText = deliveryCodes.join('\n');
  // Any paid order can open the invoice route (notif reopen must not be a dead end)
  const showInvoiceLink = isOrderPaid(orderDetails) && !fulfillmentFailed;

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
            <div>{new Date(orderDetails.created_at).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US')}</div>
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
                className="flex justify-between gap-3 text-sm py-2 border-b border-[var(--border)] last:border-0"
              >
                <span className="min-w-0 break-words font-medium">
                  {formatOrderItemDisplayName(item, { lang, order: orderDetails })}
                </span>
                <span className="font-mono flex-shrink-0">
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
            {t.topUpSentSuccess}
          </h2>
          <p className="text-[var(--text-sec)] text-sm mb-4">{t.topUpSentDesc}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(topup.gameLabel || topup.product) && (
              <div className="rounded-xl border border-[var(--border)] p-4 text-sm sm:col-span-2">
                <div className="text-[var(--text-muted)] text-xs mb-1">{t.orderProductLabel || t.itemsPurchased}</div>
                <div className="font-semibold break-words">
                  {[topup.gameLabel, topup.product].filter(Boolean).join(' — ')
                    || formatOrderItemDisplayName(firstItem, { lang, order: orderDetails })}
                </div>
              </div>
            )}
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
              <div className="text-[var(--text-muted)] text-xs mb-1">{t.playerUidLabel}</div>
              <div className="font-mono text-[var(--accent)] text-lg break-all" dir="ltr">{playerUid}</div>
            </div>
            {playerCharname && (
              <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
                <div className="text-[var(--text-muted)] text-xs mb-1">{t.playerNicknameLabel || t.charnameLabel}</div>
                <div className="font-semibold break-all">{playerCharname}</div>
              </div>
            )}
            {playerServer && (
              <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
                <div className="text-[var(--text-muted)] text-xs mb-1">{t.serverLabel}</div>
                <div className="font-mono" dir="ltr">{playerServer}</div>
              </div>
            )}
            {topup.g2bulkOrderId && (
              <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
                <div className="text-[var(--text-muted)] text-xs mb-1">{t.supplierOrderIdLabel}</div>
                <div className="font-mono" dir="ltr">#{topup.g2bulkOrderId}</div>
              </div>
            )}
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
              <div className="text-[var(--text-muted)] text-xs mb-1">{t.total}</div>
              <div className="font-semibold">${parseFloat(orderDetails.total).toFixed(2)}</div>
            </div>
            <div className="rounded-xl border border-[var(--border)] p-4 text-sm">
              <div className="text-[var(--text-muted)] text-xs mb-1">{t.date}</div>
              <div>{new Date(orderDetails.created_at).toLocaleString(lang === 'ar' ? 'ar-SY-u-nu-latn' : 'en-US')}</div>
            </div>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">{t.topUpArrivesSoon}</p>
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
          <p>{getFulfillmentFailureMessage(orderDetails, t)}</p>
        </div>
      )}

      {presentation.showSuccess && !fulfillmentFailed && user?.id && (
        <div className="card p-6 mb-6 border border-[var(--accent)]/20 bg-[var(--accent)]/5">
          <div className="flex items-start gap-3 mb-4">
            <div className="w-11 h-11 rounded-2xl bg-[var(--accent)]/15 text-[var(--accent)] flex items-center justify-center shrink-0">
              <MessageSquareHeart className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg">{t.reviewAfterPurchaseTitle}</h2>
              <p className="text-sm text-[var(--text-sec)] mt-1 leading-relaxed">
                {t.reviewAfterPurchaseDesc}
              </p>
            </div>
          </div>
          <CustomerReviewForm
            t={t}
            user={user}
            orderId={orderDetails.id}
            compact
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {showInvoiceLink && (
          <button
            type="button"
            onClick={() => navigate(`/invoice/${INVOICE_KIND.ORDER}/${orderDetails.id}`)}
            className="btn btn-primary px-6 py-3"
          >
            {t.viewInvoice}
          </button>
        )}
        <button type="button" onClick={() => navigate('/profile')} className="btn btn-secondary px-6 py-3">
          {t.myOrdersLink}
        </button>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary px-8 py-3">
          {t.backToHomeSuccess}
        </button>
      </div>
    </div>
  );
}