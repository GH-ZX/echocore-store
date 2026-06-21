import { useState, useEffect, useMemo } from 'react';
import { buildPaymentMethods, getDefaultPaymentMethod } from '../lib/paymentMethods';

export default function CheckoutView({ t, lang = 'ar', cart, submitOrder, onComplete, currentBalance = 0, paymentConfig = {} }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [simRef, setSimRef] = useState('');

  const totalNum = cart.reduce((s, i) => s + parseFloat(i.price), 0);
  const total = totalNum.toFixed(2);
  const hasEnoughBalance = currentBalance >= totalNum;
  const merchantName = paymentConfig.shamcashMerchantName || 'ECHOCORE Store';

  const allMethods = useMemo(
    () => buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance: hasEnoughBalance ? currentBalance : 0 }),
    [t, lang, paymentConfig, hasEnoughBalance, currentBalance]
  );

  const usableMethods = allMethods.filter((m) => !m.disabled && !m.comingSoon);

  const [selectedMethod, setSelectedMethod] = useState(() => {
    const methods = buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance });
    return hasEnoughBalance ? 'balance' : getDefaultPaymentMethod(methods);
  });

  useEffect(() => {
    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(hasEnoughBalance ? 'balance' : getDefaultPaymentMethod(allMethods));
    }
  }, [allMethods, selectedMethod, usableMethods, hasEnoughBalance]);

  const handleCheckoutProcess = async () => {
    if (selectedMethod === 'balance') {
      setIsProcessing(true);
      try {
        const result = await submitOrder(cart, selectedMethod);
        onComplete(result);
      } catch (e) {
        alert('Checkout failed. ' + (e.message || ''));
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      alert(lang === 'ar' ? 'طريقة الدفع غير متاحة' : 'Payment method unavailable');
      return;
    }

    setShowSimModal(true);
    setSimRef('');
  };

  const confirmExternalCheckout = async () => {
    setIsProcessing(true);
    try {
      await new Promise((r) => setTimeout(r, 1200));
      const ref = `ECHOCORE-${Date.now().toString(36).toUpperCase()}`;
      const result = await submitOrder(cart, selectedMethod);
      setSimRef(ref);
      setTimeout(() => {
        setShowSimModal(false);
        setIsProcessing(false);
        onComplete(result);
      }, 700);
    } catch (e) {
      alert('Payment failed. ' + (e.message || ''));
      setIsProcessing(false);
      setShowSimModal(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
      <div className="card p-8 md:p-12">
        <h2 className="text-3xl font-black mb-2 text-center">{t.paymentMethod}</h2>
        <div className="text-center text-sm text-[var(--text-sec)] mb-3">
          Order total: <span className="font-mono font-bold text-[var(--accent)]">${total}</span>
        </div>
        <div className="text-center text-xs mb-6 text-[var(--text-muted)]">
          {t.currentBalance ? `${t.currentBalance}: ` : 'Your balance: '}<span className="font-mono">${currentBalance.toFixed(2)}</span>
        </div>

        <div className="space-y-3 mb-8">
          {allMethods.map((method) => {
            const Icon = method.icon;
            const active = selectedMethod === method.id;
            const isBalance = method.id === 'balance';
            const isDisabled = method.disabled || method.comingSoon;
            return (
              <div
                key={method.id}
                onClick={() => {
                  if (isDisabled) return;
                  if (isBalance && !hasEnoughBalance) return;
                  setSelectedMethod(method.id);
                }}
                className={`flex items-center p-5 rounded-2xl border transition-all ${
                  isDisabled
                    ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                    : `cursor-pointer ${active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/70'} ${isBalance ? 'ring-1 ring-emerald-500/30' : ''}`
                }`}
              >
                <Icon className={`w-9 h-9 ${method.color} mx-4 flex-shrink-0`} />
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-lg flex items-center gap-2">
                    {method.name}
                    {method.comingSoon && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                        {t.comingSoon || (lang === 'ar' ? 'قريباً' : 'Coming soon')}
                      </span>
                    )}
                  </div>
                  {isBalance && (
                    <div className="text-[10px] text-emerald-400">{t.useBalance || 'Deduct directly from your account balance'}</div>
                  )}
                </div>
                {isBalance && !hasEnoughBalance && (
                  <div className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400">{t.insufficientBalance || 'Not enough'}</div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleCheckoutProcess}
          disabled={isProcessing || cart.length === 0 || (selectedMethod === 'balance' && !hasEnoughBalance) || (selectedMethod !== 'balance' && !usableMethods.some((m) => m.id === selectedMethod))}
          className="btn btn-primary w-full py-5 text-xl font-black disabled:opacity-60"
        >
          {isProcessing ? 'Processing...' : (selectedMethod === 'balance' ? (t.payFromBalance || 'Pay from Balance') : t.payNow)}
        </button>

        <div className="text-center text-xs text-[var(--text-muted)] mt-4">
          {selectedMethod === 'balance' ? (t.balanceUsed || 'Instant deduction from balance') : 'Instant delivery after payment confirmation'}
        </div>
      </div>

      {showSimModal && selectedMethod === 'ShamCash' && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-center justify-center p-4" onClick={() => !isProcessing && setShowSimModal(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold mb-2 text-center">{t.confirmPayment || (lang === 'ar' ? 'تأكيد الدفع' : 'Confirm Payment')}</h3>
            <p className="text-center text-sm mb-5 text-[var(--text-sec)]">${total} → {merchantName}</p>

            <div className="bg-black/60 rounded-2xl p-4 mb-4 text-center">
              <div className="text-green-400 text-sm mb-1">SHAMCASH REFERENCE</div>
              <div className="font-mono text-lg">ECHOCORE-{Date.now().toString().slice(-7)}</div>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {lang === 'ar' ? 'ادفع عبر تطبيق ShamCash ثم أكّد' : 'Pay in ShamCash app, then confirm'}
              </p>
            </div>

            {!simRef ? (
              <button onClick={confirmExternalCheckout} disabled={isProcessing} className="btn btn-primary w-full py-4">
                {isProcessing ? 'Processing...' : (t.payNow || 'Pay Now')}
              </button>
            ) : (
              <div className="text-center text-emerald-400 py-2 font-bold">Payment successful! Redirecting...</div>
            )}

            {!isProcessing && <button onClick={() => setShowSimModal(false)} className="text-xs mt-3 text-[var(--text-sec)] w-full">Cancel</button>}
          </div>
        </div>
      )}
    </div>
  );
}