import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  FlaskConical,
  Wallet,
  PackageCheck,
  AlertTriangle,
  Trash2,
  Play,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import {
  adminClearTestBalance,
  adminCreditTestBalance,
  adminGetDevWallet,
  adminRunMockPurchase,
  isMockFulfillmentEnabled,
} from '../../lib/devTools';

export default function AdminDevTools({
  t = {},
  lang = 'ar',
  offers = [],
  orders = [],
  onBalanceCredited,
  onNotify,
}) {
  const isAr = lang === 'ar';
  const mockMode = isMockFulfillmentEnabled();
  const [creditAmount, setCreditAmount] = useState('50');
  const [offerId, setOfferId] = useState('');
  const [mockCode, setMockCode] = useState('');
  const [wallet, setWallet] = useState({ balance: 0, devTestBalance: 0 });
  const [loading, setLoading] = useState('');
  const [lastRun, setLastRun] = useState(null);

  const purchasableOffers = useMemo(
    () => [...offers]
      .filter((offer) => offer?.id && Number.isFinite(parseFloat(offer.price)))
      .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
      .slice(0, 40),
    [offers],
  );

  const recentMockOrders = useMemo(
    () => orders
      .filter((order) => order.status === 'completed')
      .slice(0, 5),
    [orders],
  );

  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');

  const refreshWallet = async () => {
    try {
      const data = await adminGetDevWallet();
      setWallet({
        balance: parseFloat(data.balance) || 0,
        devTestBalance: parseFloat(data.devTestBalance) || 0,
      });
      return data;
    } catch (err) {
      notifyError(err.message);
      return null;
    }
  };

  useEffect(() => {
    refreshWallet();
  }, []);

  useEffect(() => {
    if (!offerId && purchasableOffers.length > 0) {
      setOfferId(purchasableOffers[0].id);
    }
  }, [offerId, purchasableOffers]);

  const applyWalletResult = (result) => {
    if (!result) return;
    setWallet({
      balance: parseFloat(result.newBalance) || 0,
      devTestBalance: parseFloat(result.devTestBalance) || 0,
    });
    onBalanceCredited?.(result);
  };

  const onCreditBalance = async () => {
    const amount = parseFloat(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      notifyError(isAr ? 'أدخل مبلغاً صالحاً' : 'Enter a valid amount');
      return;
    }
    setLoading('credit');
    try {
      const result = await adminCreditTestBalance(amount);
      applyWalletResult(result);
      notifySuccess(
        isAr
          ? `أُضيف ${amount.toFixed(2)}$ رصيداً تجريبياً`
          : `Added $${amount.toFixed(2)} test balance`,
      );
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading('');
    }
  };

  const onClearTestBalance = async () => {
    setLoading('clear');
    try {
      const result = await adminClearTestBalance();
      applyWalletResult(result);
      const removed = parseFloat(result.removed) || 0;
      notifySuccess(
        removed > 0
          ? (isAr ? `تم مسح ${removed.toFixed(2)}$ من الرصيد التجريبي` : `Removed $${removed.toFixed(2)} test balance`)
          : (isAr ? 'لا يوجد رصيد تجريبي لمسحه' : 'No test balance to clear'),
      );
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading('');
    }
  };

  const onRunMockPurchase = async () => {
    if (!offerId) {
      notifyError(isAr ? 'اختر عرضاً للاختبار' : 'Select an offer to test');
      return;
    }
    setLoading('purchase');
    try {
      const result = await adminRunMockPurchase(offerId, mockCode.trim() || null);
      applyWalletResult(result);
      setLastRun(result);
      notifySuccess(
        isAr
          ? 'اكتملت محاكاة الشراء — تحقق من الإيصال وبريد الموقع'
          : 'Mock purchase complete — check receipt and site inbox',
      );
    } catch (err) {
      notifyError(err.message);
    } finally {
      setLoading('');
    }
  };

  const selectedOffer = purchasableOffers.find((offer) => offer.id === offerId);

  return (
    <div className="space-y-6">
      <div className="card p-5 border border-amber-500/25 bg-amber-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-[var(--text-sec)] leading-relaxed">
            {t.devToolsWarning || (isAr
              ? 'أدوات المطور فقط. محاكاة الشراء تستخدم رصيداً تجريبياً — ليس دفعاً حقيقياً ولا G2Bulk.'
              : 'Developer-only. Mock purchases use test balance — not real payments or G2Bulk.')}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-bold text-lg flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[var(--accent)]" />
            {t.devWalletTitle || (isAr ? 'محفظة الاختبار' : 'Test wallet')}
          </h3>
          <button
            type="button"
            onClick={refreshWallet}
            className="btn btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {t.refresh || (isAr ? 'تحديث' : 'Refresh')}
          </button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="rounded-xl border border-[var(--border)] p-4">
            <div className="text-xs text-[var(--text-muted)] mb-1">{isAr ? 'الرصيد الكلي' : 'Total balance'}</div>
            <div className="text-2xl font-black text-[var(--accent)]">${wallet.balance.toFixed(2)}</div>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4">
            <div className="text-xs text-[var(--text-muted)] mb-1">{t.devTestBalanceLabel || (isAr ? 'رصيد تجريبي (قابل للمسح)' : 'Test balance (clearable)')}</div>
            <div className="text-2xl font-black text-amber-300">${wallet.devTestBalance.toFixed(2)}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
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
            {loading === 'credit' ? '...' : (t.devAddTestBalance || (isAr ? 'إضافة تجريبي' : 'Add test'))}
          </button>
          <button
            type="button"
            onClick={onClearTestBalance}
            disabled={loading === 'clear' || wallet.devTestBalance <= 0}
            className="btn btn-secondary whitespace-nowrap inline-flex items-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            {t.devClearTestBalance || (isAr ? 'مسح التجريبي' : 'Clear test')}
          </button>
        </div>
      </div>

      <div className="card p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <Play className="w-5 h-5 text-[var(--accent)]" />
          {t.devMockPurchaseTitle || (isAr ? 'محاكاة شراء كاملة' : 'Full mock purchase')}
        </h3>
        <p className="text-sm text-[var(--text-sec)] mb-4">
          {t.devMockPurchaseDesc || (isAr
            ? 'خطوة واحدة: يضيف رصيداً تجريبياً إن لزم، ينشئ الطلب، يحاكي التوريد، ويُسجّل في بريد الموقع.'
            : 'One step: adds test balance if needed, creates the order, mock-fulfills, and posts to site inbox.')}
        </p>

        {purchasableOffers.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">
            {isAr ? 'لا توجد عروض متاحة للاختبار.' : 'No offers available to test.'}
          </p>
        ) : (
          <>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">
              {isAr ? 'اختر العرض' : 'Select offer'}
            </label>
            <select
              value={offerId}
              onChange={(e) => setOfferId(e.target.value)}
              className="input w-full mb-3"
            >
              {purchasableOffers.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {(isAr ? offer.name_ar : offer.name_en) || offer.name_en} — ${parseFloat(offer.price).toFixed(2)}
                </option>
              ))}
            </select>

            {selectedOffer && (
              <p className="text-xs text-[var(--text-muted)] mb-3">
                {isAr ? 'سعر الاختبار:' : 'Test price:'}{' '}
                <span className="font-mono text-[var(--accent)]">${parseFloat(selectedOffer.price).toFixed(2)}</span>
              </p>
            )}

            <input
              type="text"
              value={mockCode}
              onChange={(e) => setMockCode(e.target.value)}
              placeholder={isAr ? 'كود وهمي اختياري' : 'Optional mock redeem code'}
              className="input w-full mb-3 font-mono text-xs"
            />

            <button
              type="button"
              onClick={onRunMockPurchase}
              disabled={loading === 'purchase' || !offerId}
              className="btn btn-primary w-full inline-flex items-center justify-center gap-2"
            >
              <PackageCheck className="w-4 h-4" />
              {loading === 'purchase'
                ? (isAr ? 'جاري المحاكاة...' : 'Running mock purchase...')
                : (t.devRunMockPurchase || (isAr ? 'تشغيل محاكاة الشراء' : 'Run mock purchase'))}
            </button>
          </>
        )}

        {lastRun?.orderId && (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
            <div className="font-semibold text-emerald-300 mb-2">
              {isAr ? 'آخر محاكاة ناجحة' : 'Last successful mock run'}
            </div>
            <div className="text-[var(--text-sec)] space-y-1">
              <div>{isAr ? 'العرض:' : 'Offer:'} {lastRun.offerName}</div>
              <div>{isAr ? 'الطلب:' : 'Order:'} <span className="font-mono text-xs">{lastRun.orderId}</span></div>
            </div>
            <Link
              to={lastRun.receiptPath || `/success?orderId=${lastRun.orderId}`}
              className="btn btn-secondary mt-3 inline-flex items-center gap-2 text-xs py-2"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {isAr ? 'فتح الإيصال' : 'Open receipt'}
            </Link>
          </div>
        )}
      </div>

      {recentMockOrders.length > 0 && (
        <div className="card p-5">
          <h3 className="font-bold text-lg mb-3">{isAr ? 'طلبات مكتملة حديثاً' : 'Recent completed orders'}</h3>
          <div className="space-y-2">
            {recentMockOrders.map((order) => (
              <Link
                key={order.id}
                to={`/success?orderId=${order.id}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:border-[var(--accent)]/40 transition-colors"
              >
                <span className="font-mono text-xs">#{order.id.slice(0, 8)}</span>
                <span>${parseFloat(order.total).toFixed(2)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <h3 className="font-bold text-lg mb-2 flex items-center gap-2">
          <FlaskConical className="w-5 h-5 text-[var(--accent)]" />
          {t.devInboxNote || (isAr ? 'بريد الموقع' : 'Site inbox')}
        </h3>
        <p className="text-sm text-[var(--text-sec)]">
          {isAr
            ? 'بعد المحاكاة افتح الجرس أو /notifications — كل التحديثات داخل الموقع فقط.'
            : 'After a mock run, open the bell or /notifications — all updates stay inside the site.'}
        </p>
        <p className="text-xs text-[var(--text-muted)] mt-4">
          {mockMode
            ? (isAr ? 'VITE_MOCK_FULFILLMENT=true مفعّل.' : 'VITE_MOCK_FULFILLMENT=true is enabled.')
            : (isAr ? 'اختياري: VITE_MOCK_FULFILLMENT=true لتخطي G2Bulk تلقائياً.' : 'Optional: VITE_MOCK_FULFILLMENT=true to skip auto G2Bulk.')}
        </p>
      </div>
    </div>
  );
}