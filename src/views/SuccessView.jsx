import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Copy, Check, Loader2, Receipt, KeyRound, UserRound } from 'lucide-react';
import { supabase } from '../lib/supabase';

function shortOrderId(id) {
  if (!id) return '';
  return id.slice(0, 8).toUpperCase();
}

async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function SuccessView({ navigate, games: _games = [], t = {}, lang = 'ar' }) {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(null);

  const loadOrder = useCallback(async () => {
    if (!orderId) return null;

    const { data: order } = await supabase
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

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

        const status = result.order.fulfillment_status;
        const codes = (result.items || []).flatMap((item) => (
          Array.isArray(item.delivery_items) ? item.delivery_items : []
        ));
        const shouldPoll = status === 'fulfilling' && codes.length === 0;

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
        <p className="text-xl text-[var(--text-sec)]">{t.orderNotFound || (lang === 'ar' ? 'الطلب غير موجود.' : 'Order not found.')}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  const firstItem = orderItems[0] || {};
  const playerUid = firstItem.player_uid;
  const playerServer = firstItem.player_server;
  const hasUid = !!playerUid;

  const deliveryCodes = orderItems.flatMap((item) => {
    if (!item.delivery_items) return [];
    return Array.isArray(item.delivery_items) ? item.delivery_items : [];
  });
  const hasCodes = deliveryCodes.length > 0;
  const isArabic = lang === 'ar';
  const fulfillmentStatus = orderDetails.fulfillment_status;
  const isFulfilling = fulfillmentStatus === 'fulfilling' && !hasCodes && !hasUid;
  const allCodesText = deliveryCodes.join('\n');

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 animate-fade-in">
      <div className="card p-6 sm:p-8 mb-6 border border-emerald-500/20 bg-emerald-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-400 flex-shrink-0">
            <Receipt className="w-7 h-7" strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs uppercase tracking-wider text-emerald-400/90 font-bold mb-1">
              {isArabic ? 'إيصال الشراء' : 'Purchase receipt'}
            </p>
            <h1 className="text-2xl sm:text-3xl font-black">{t.successMsg}</h1>
            <p className="text-[var(--text-sec)] text-sm mt-1">
              {isArabic
                ? `رقم الطلب #${shortOrderId(orderDetails.id)} — تم حفظ طلبك بنجاح.`
                : `Order #${shortOrderId(orderDetails.id)} — your order was saved successfully.`}
            </p>
          </div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">{t.orderInfo}</h2>
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{isArabic ? 'رقم الطلب' : 'Order ID'}</div>
            <div className="font-mono text-xs break-all">{orderDetails.id}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.total}</div>
            <div className="font-bold text-lg text-[var(--accent)]">${parseFloat(orderDetails.total).toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{isArabic ? 'طريقة الدفع' : 'Payment'}</div>
            <div>{orderDetails.payment_method === 'balance' ? (t.payFromBalance || 'Balance') : orderDetails.payment_method}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] p-3">
            <div className="text-[var(--text-muted)] text-xs mb-1">{t.date}</div>
            <div>{new Date(orderDetails.created_at).toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-lg mb-4">{t.itemsPurchased}</h2>
        {orderItems.length > 0 ? (
          <div className="space-y-2">
            {orderItems.map((item) => (
              <div key={item.id || `${item.name_snapshot}-${item.price}`} className="flex justify-between text-sm py-2 border-b border-[var(--border)] last:border-0">
                <span>{item.name_snapshot}</span>
                <span className="font-mono">${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}</span>
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
                {copiedKey === 'all'
                  ? (isArabic ? 'تم النسخ' : 'Copied')
                  : (isArabic ? 'نسخ الكل' : 'Copy all')}
              </button>
            )}
          </div>
          <div className="space-y-3">
            {deliveryCodes.map((code, idx) => (
              <div key={`${code}-${idx}`} className="bg-[var(--bg-primary)] p-4 rounded-xl flex items-center gap-3">
                <div className="flex-1 min-w-0 text-center sm:text-left">
                  <div className="text-xl sm:text-2xl font-mono tracking-wide text-[var(--accent)] break-all">{code}</div>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(code, `code-${idx}`)}
                  className="header-btn header-btn-icon flex-shrink-0"
                  title={isArabic ? 'نسخ' : 'Copy'}
                >
                  {copiedKey === `code-${idx}` ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            ))}
          </div>
          <p className="text-[var(--text-sec)] text-sm mt-4">{t.useCodeInGame}</p>
        </div>
      )}

      {hasUid && (
        <div className="card p-6 mb-6 border border-emerald-500/25 bg-emerald-500/5">
          <h2 className="font-bold text-lg mb-3 flex items-center gap-2 text-emerald-400">
            <UserRound className="w-5 h-5" />
            {t.topUpSentSuccess}
          </h2>
          <p className="text-[var(--text-sec)] text-sm mb-4">{t.topUpSentDesc}</p>
          <div className="rounded-xl border border-[var(--border)] p-4 text-sm space-y-2">
            <div>
              <span className="text-[var(--text-muted)]">UID: </span>
              <span className="font-mono text-[var(--accent)] text-lg">{playerUid}</span>
            </div>
            {playerServer && (
              <div>
                <span className="text-[var(--text-muted)]">{t.serverLabel}: </span>
                <span className="font-mono">{playerServer}</span>
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-3">{t.topUpArrivesSoon}</p>
        </div>
      )}

      {isFulfilling && (
        <div className="card p-6 mb-6 text-center text-[var(--text-sec)]">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--accent)] mx-auto mb-2" />
          {isArabic ? 'جاري تجهيز الكود — سيتم التحديث تلقائياً.' : 'Preparing your code — updating automatically.'}
        </div>
      )}

      {!hasUid && !hasCodes && fulfillmentStatus === 'failed' && (
        <div className="card p-6 mb-6 text-center border border-red-500/30 bg-red-500/5 text-red-300">
          {isArabic
            ? 'تعذر تجهيز الطلب تلقائياً. تواصل مع الدعم مع رقم الطلب أعلاه.'
            : 'Auto-fulfillment failed. Contact support with your order ID above.'}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button type="button" onClick={() => navigate('/profile')} className="btn btn-secondary px-6 py-3">
          {isArabic ? 'طلباتي' : 'My orders'}
        </button>
        <button type="button" onClick={() => navigate('/')} className="btn btn-primary px-8 py-3">
          {t.backToHomeSuccess || t.backToHome}
        </button>
      </div>
    </div>
  );
}