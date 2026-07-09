import { useState } from 'react';
import { FlaskConical, Wallet, PackageCheck, AlertTriangle } from 'lucide-react';
import { adminCreditTestBalance, adminMockFulfillOrder, isMockFulfillmentEnabled } from '../../lib/devTools';

export default function AdminDevTools({
  t = {},
  lang = 'ar',
  orders = [],
  onBalanceCredited,
  onNotify,
}) {
  const isAr = lang === 'ar';
  const mockMode = isMockFulfillmentEnabled();
  const [creditAmount, setCreditAmount] = useState('100');
  const [orderId, setOrderId] = useState('');
  const [mockCode, setMockCode] = useState('');
  const [loading, setLoading] = useState('');

  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');

  const completedOrders = orders
    .filter((order) => order.status === 'completed')
    .slice(0, 8);

  const onCreditBalance = async () => {
    const amount = parseFloat(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError(isAr ? 'أدخل مبلغاً صالحاً' : 'Enter a valid amount');
      return;
    }
    setLoading('credit');
    try {
      const result = await adminCreditTestBalance(amount);
      onBalanceCredited?.(result);
      notifySuccess(
        isAr
          ? `تمت إضافة ${amount.toFixed(2)}$ — الرصيد ${parseFloat(result.newBalance).toFixed(2)}$`
          : `Added $${amount.toFixed(2)} — balance is now $${parseFloat(result.newBalance).toFixed(2)}`,
      );
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading('');
    }
  };

  const onMockFulfill = async () => {
    if (!orderId.trim()) {
      notifyError(isAr ? 'اختر أو أدخل رقم الطلب' : 'Select or enter an order ID');
      return;
    }
    setLoading('fulfill');
    try {
      await adminMockFulfillOrder(orderId.trim(), mockCode.trim() || null);
      notifySuccess(
        isAr
          ? 'تم محاكاة التوريد — تحقق من الإيصال والإشعارات'
          : 'Mock fulfillment done — check receipt and notifications',
      );
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="card p-5 border border-amber-500/25 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--text-sec)] leading-relaxed">
            {isAr
              ? 'أدوات للمطور فقط — لا تظهر للعملاء. استخدمها لاختبار الشراء والإشعارات دون دفع حقيقي أو G2Bulk.'
              : 'Developer-only tools — not visible to customers. Test purchases and notifications without real payments or G2Bulk.'}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <div className="card p-5">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[var(--accent)]" />
            {t.devCreditBalance || (isAr ? 'رصيد تجريبي' : 'Test balance')}
          </h3>
          <p className="text-sm text-[var(--text-sec)] mb-4">
            {t.devCreditBalanceDesc || (isAr
              ? 'أضف رصيداً لحسابك كمسؤول، ثم اشترِ من المتجر بخيار "الرصيد".'
              : 'Add balance to your admin account, then buy from the store using "Balance".')}
          </p>
          <div className="flex gap-2">
            <input
              type="number"
              min="1"
              max="1000"
              step="1"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="input flex-1"
            />
            <button
              type="button"
              onClick={onCreditBalance}
              disabled={loading === 'credit'}
              className="btn btn-primary whitespace-nowrap"
            >
              {loading === 'credit' ? '...' : (isAr ? 'إضافة' : 'Add')}
            </button>
          </div>
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
            <PackageCheck className="w-5 h-5 text-[var(--accent)]" />
            {t.devMockFulfill || (isAr ? 'محاكاة التوريد' : 'Mock fulfillment')}
          </h3>
          <p className="text-sm text-[var(--text-sec)] mb-4">
            {t.devMockFulfillDesc || (isAr
              ? 'بعد شراء تجريبي بالرصيد، حاكِ إرسال كود الاسترداد أو إكمال شحن UID دون G2Bulk.'
              : 'After a test balance purchase, simulate redeem code delivery or UID top-up without G2Bulk.')}
          </p>
          {completedOrders.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {completedOrders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setOrderId(order.id)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${
                    orderId === order.id
                      ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/40'
                  }`}
                >
                  #{order.id.slice(0, 8)} · ${parseFloat(order.total).toFixed(2)}
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            value={orderId}
            onChange={(e) => setOrderId(e.target.value)}
            placeholder={isAr ? 'معرّف الطلب (UUID)' : 'Order ID (UUID)'}
            className="input w-full mb-2 font-mono text-xs"
          />
          <input
            type="text"
            value={mockCode}
            onChange={(e) => setMockCode(e.target.value)}
            placeholder={isAr ? 'كود وهمي اختياري (مثال TEST-ABC123)' : 'Optional mock code (e.g. TEST-ABC123)'}
            className="input w-full mb-3 font-mono text-xs"
          />
          <button
            type="button"
            onClick={onMockFulfill}
            disabled={loading === 'fulfill'}
            className="btn btn-secondary w-full"
          >
            {loading === 'fulfill' ? '...' : (isAr ? 'تشغيل المحاكاة' : 'Run mock fulfillment')}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-[var(--accent)]" />
          {t.devTestFlow || (isAr ? 'سير اختبار سريع' : 'Quick test flow')}
        </h3>
        <ol className="text-sm text-[var(--text-sec)] space-y-2 list-decimal list-inside">
          <li>{isAr ? 'أضف رصيداً تجريبياً (أعلاه).' : 'Add test balance (above).'}</li>
          <li>{isAr ? 'اشترِ عرضاً من المتجر واختر الدفع من الرصيد.' : 'Buy an offer from the store using Balance payment.'}</li>
          <li>{isAr ? 'افتح الإيصال من /success — ثم شغّل محاكاة التوريد إن لم يكن G2Bulk مفعّلاً.' : 'Open the receipt at /success — run mock fulfillment if G2Bulk is not configured.'}</li>
          <li>{isAr ? 'تحقق من الإشعار في الجرس (كود جاهز / شحن UID).' : 'Check the bell notification (code ready / UID delivered).'}</li>
        </ol>
        <p className="text-xs text-[var(--text-muted)] mt-4">
          {mockMode
            ? (isAr ? 'VITE_MOCK_FULFILLMENT=true — التوريد التلقائي معطّل؛ استخدم المحاكاة يدوياً.' : 'VITE_MOCK_FULFILLMENT=true — auto-fulfillment skipped; use mock manually.')
            : (isAr ? 'لتعطيل G2Bulk تلقائياً: ضع VITE_MOCK_FULFILLMENT=true في .env' : 'To skip auto G2Bulk: set VITE_MOCK_FULFILLMENT=true in .env')}
        </p>
      </div>
    </div>
  );
}