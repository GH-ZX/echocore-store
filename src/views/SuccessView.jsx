import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';

export default function SuccessView({ navigate, games = [], t = {}, lang = 'ar' }) {
  const [searchParams] = useSearchParams();
  const orderId = searchParams.get('orderId');
  const [orderDetails, setOrderDetails] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setLoading(false);
      return;
    }

    const fetchOrder = async () => {
      try {
        const { data: order } = await supabase
          .from('orders')
          .select('*')
          .eq('id', orderId)
          .single();

        const { data: items } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', orderId);

        setOrderDetails(order);
        setOrderItems(items || []);
      } catch (err) {
        console.error('Fetch order error:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchOrder();
  }, [orderId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-[var(--text-sec)]">{t.loadingOrderDetails}</p>
      </div>
    );
  }

  if (!orderDetails) {
    return (
      <div className="max-w-4xl mx-auto p-6 text-center">
        <p className="text-xl text-[var(--text-sec)]">{t.orderNotFound || (lang === 'ar' ? 'الطلب غير موجود.' : 'Order not found.')}</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  // Determine redemption type based on player_uid presence (from BuyView)
  const firstItem = orderItems[0] || {};
  const playerUid = firstItem.player_uid;
  const playerServer = firstItem.player_server;
  const hasUid = !!playerUid;

  const demoCode = hasUid ? null : `CODE-${orderId.slice(0, 8).toUpperCase()}`;
  const isArabic = lang === 'ar';

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center mb-8">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-black mb-2">
          {t.successMsg}
        </h1>
        <p className="text-[var(--text-sec)]">
          {t.codeOrUidInGame || (isArabic ? 'تم تسجيل طلبك بنجاح في قاعدة البيانات.' : 'Your order has been recorded successfully.')}
        </p>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-xl mb-4">{t.orderInfo}</h2>
        <div className="space-y-2 text-sm">
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'رقم الطلب' : 'Order ID'}:</span> <span className="font-mono">{orderDetails.id}</span></div>
          <div><span className="text-[var(--text-muted)]">{t.total}:</span> ${parseFloat(orderDetails.total).toFixed(2)}</div>
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'طريقة الدفع' : 'Payment Method'}:</span> {orderDetails.payment_method === 'balance' ? (t.payFromBalance || 'رصيد الحساب') : orderDetails.payment_method}</div>
          <div><span className="text-[var(--text-muted)]">{t.date}:</span> {new Date(orderDetails.created_at).toLocaleString()}</div>
          <div><span className="text-[var(--text-muted)]">{isArabic ? 'الحالة' : 'Status'}:</span> <span className="capitalize text-emerald-400">{orderDetails.status || 'completed'}</span></div>
        </div>
      </div>

      <div className="card p-6 mb-6">
        <h2 className="font-bold text-xl mb-4">{t.itemsPurchased}</h2>
        {orderItems.length > 0 ? (
          <div className="space-y-2">
            {orderItems.map((item, idx) => (
              <div key={idx} className="flex justify-between text-sm py-1 border-b border-[var(--border)] last:border-0">
                <span>{item.name_snapshot}</span>
                <span className="font-mono">${parseFloat(item.price).toFixed(2)} × {item.quantity || 1}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[var(--text-sec)]">{t.noItems}</p>
        )}

        {/* Player UID info - always show if present */}
        {hasUid && (
          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <div className="text-sm font-semibold mb-2 text-emerald-400">
              {t.topUpSent}
            </div>
            <div className="text-sm">
              <span className="text-[var(--text-muted)]">{isArabic ? 'UID:' : 'UID:'}</span>{' '}
              <span className="font-mono text-[var(--accent)] text-lg">{playerUid}</span>
              {playerServer && (
                <>
                  {' • '}<span className="text-[var(--text-muted)]">{t.serverLabel}:</span>{' '}
                  <span className="font-mono">{playerServer}</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Redeem Code Section - ONLY for redeem_code purchases */}
      {!hasUid && demoCode && (
        <div className="card p-6 mb-6">
          <h2 className="font-bold text-xl mb-4">
            {t.yourRedeemCode}
          </h2>
          <div className="bg-[var(--bg-primary)] p-6 rounded-xl text-center mb-4">
            <div className="text-4xl font-mono tracking-widest text-[var(--accent)] mb-2">{demoCode}</div>
            <p className="text-xs text-[var(--text-muted)]">
              {t.demoCodeNote}
            </p>
          </div>
          <p className="text-[var(--text-sec)] text-sm">
            {t.useCodeInGame}
          </p>
        </div>
      )}

      {/* UID Only Success - no redeem code shown */}
      {hasUid && (
        <div className="card p-6 mb-6 text-center">
          <h2 className="font-bold text-xl mb-3 text-emerald-400">
            {t.topUpSentSuccess}
          </h2>
          <p className="text-[var(--text-sec)]">
            {t.topUpSentDesc}
          </p>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {t.topUpArrivesSoon}
          </p>
        </div>
      )}

      <div className="text-center">
        <button onClick={() => navigate('/')} className="btn btn-primary px-8 py-3">
          {t.backToHomeSuccess || t.backToHome}
        </button>
      </div>
    </div>
  );
}
