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

/** Quiet background refresh while supplier is still delivering (does not re-show loading). */
const FULFILLMENT_POLL_MS = 4_000;
/** Cover slow PUBG/ML top-ups until webhook or re-poll marks fulfilled */
const FULFILLMENT_POLL_MAX_MS = 8 * 60_000;
const FULFILL_RESYNC_EVERY_MS = 25_000;


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
  /** true until first successful receipt finishes */
  const [loading, setLoading] = useState(true);
  const [lookupError, setLookupError] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);
  const fulfillStarted = useRef(false);

  const userId = user?.id || null;
  const userRole = user?.role || null;

  const applyReceipt = useCallback((receipt) => {
    const order = receipt?.order || null;
    const items = receipt?.items || [];
    const principal = { id: userId, role: userRole };
    if (!order || !canUserAccessOrderReceipt(order, principal)) {
      setOrderDetails(null);
      setOrderItems([]);
      return null;
    }
    setOrderDetails(order);
    setOrderItems(items);
    setLookupError(null);
    return { order, items };
  }, [userId, userRole]);

  const loadOrder = useCallback(async () => {
    if (!orderId || !userId) return null;
    const receipt = await fetchMyOrderReceipt(orderId);
    return applyReceipt(receipt);
  }, [orderId, userId, applyReceipt]);

  // One fast load (same style as InvoiceView). ~1s is enough; no multi-minute retry loop.
  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      setLookupError(null);
      setOrderDetails(null);
      setOrderItems([]);
      return undefined;
    }

    if (!userId) {
      // Wait for auth hydrate only — brief spinner
      setLoading(true);
      return undefined;
    }

    let cancelled = false;
    fulfillStarted.current = false;
    setLoading(true);
    setLookupError(null);

    (async () => {
      try {
        const result = await loadOrder();
        if (cancelled) return;
        if (!result?.order) {
          setOrderDetails(null);
          setOrderItems([]);
        }
      } catch (err) {
        console.error('Fetch order error:', err);
        if (cancelled) return;
        setLookupError(err?.message || String(err));
        setOrderDetails(null);
        setOrderItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orderId, userId, loadOrder]);

  // Background poll while delivery runs: re-sync with supplier (not DB-only) so
  // top-ups that finish after the first 40s edge poll still flip to delivered.
  useEffect(() => {
    if (loading || !orderId || !userId || !orderDetails) return undefined;
    if (!isOrderPaid(orderDetails)) return undefined;

    const fs0 = orderDetails.fulfillment_status || 'pending';
    const codes0 = extractDeliveryCodes(orderItems, orderDetails.g2bulk_metadata);
    const alreadyDone = fs0 === 'fulfilled' || fs0 === 'skipped' || fs0 === 'failed' || codes0.length > 0;
    if (alreadyDone) return undefined;

    let cancelled = false;
    const startedAt = Date.now();
    let lastResyncAt = 0;
    let timer = null;

    const tick = async () => {
      if (cancelled || Date.now() - startedAt > FULFILLMENT_POLL_MAX_MS) return;
      try {
        const now = Date.now();
        if (
          onFulfillOrder
          && now - lastResyncAt >= FULFILL_RESYNC_EVERY_MS
        ) {
          lastResyncAt = now;
          try {
            // Once a supplier order exists, only re-check status — never re-send top-up
            const hasSupplier = !!(
              orderDetails?.g2bulk_order_id
              || orderDetails?.g2bulk_metadata?.g2bulk_order_id
            );
            await onFulfillOrder(orderId, { pollOnly: hasSupplier });
          } catch {
            /* poll will retry */
          }
        }
        const result = await loadOrder();
        if (cancelled || !result?.order) return;
        const codes = extractDeliveryCodes(result.items, result.order.g2bulk_metadata);
        const fs = result.order.fulfillment_status || 'pending';
        const done = fs === 'fulfilled' || fs === 'skipped' || fs === 'failed' || codes.length > 0;
        if (done) return;
      } catch {
        /* keep last good snapshot */
      }
      if (!cancelled) timer = setTimeout(tick, FULFILLMENT_POLL_MS);
    };

    timer = setTimeout(tick, FULFILLMENT_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // Only start once per order id after first paint (do not restart every poll update)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid restart on each receipt refresh
  }, [loading, orderId, userId, orderDetails?.id]);

  // Auto-fulfill only right after checkout in this tab (session marker). Notif reopen must not hang.
  useEffect(() => {
    if (!orderDetails || !orderId || fulfillStarted.current || !userId) return;
    if (!canUserAccessOrderReceipt(orderDetails, { id: userId, role: userRole })) return;
    if (!shouldTriggerFulfillment(orderDetails) || !onFulfillOrder) return;
    if (!consumeOrderFulfillMarker(orderId)) return;

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

  // Brief spinner only while first fetch is in flight (auth + one table read)
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-center">
        <Loader2 className="w-8 h-8 animate-spin text-[var(--accent)] mx-auto mb-3" />
        <p className="text-[var(--text-sec)]">{t.loadingOrderDetails}</p>
        {shortOrderRef ? (
          <p className="text-xs text-[var(--text-muted)] mt-2 font-mono" dir="ltr">
            #{shortOrderRef}
          </p>
        ) : null}
      </div>
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
              setLookupError(null);
              loadOrder()
                .catch((err) => {
                  setLookupError(err?.message || String(err));
                  setOrderDetails(null);
                  setOrderItems([]);
                })
                .finally(() => setLoading(false));
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