import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, CheckCircle, Wallet } from 'lucide-react';
import { buildPaymentMethods, getDefaultPaymentMethod } from '../lib/paymentMethods';

export default function RechargeView({ t, lang, navigate, user, currentBalance, onRechargeComplete, paymentConfig = {}, onNotify }) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [simRef, setSimRef] = useState('');
  const [pendingShamRef, setPendingShamRef] = useState('');

  const paymentMethods = useMemo(
    () => buildPaymentMethods(t, lang, paymentConfig),
    [t, lang, paymentConfig]
  );

  const usableMethods = paymentMethods.filter((m) => !m.disabled && !m.comingSoon);

  const [selectedMethod, setSelectedMethod] = useState(() => getDefaultPaymentMethod(paymentMethods));

  useEffect(() => {
    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(getDefaultPaymentMethod(paymentMethods));
    }
  }, [paymentMethods, selectedMethod, usableMethods]);

  const balance = typeof currentBalance === 'number' ? currentBalance : (user?.balance || 0);
  const presetAmounts = [5, 10, 25, 50, 100];
  const effectiveAmount = customAmount ? parseFloat(customAmount) : selectedAmount;
  const isValidAmount = effectiveAmount > 0 && effectiveAmount <= 1000;
  const merchantName = paymentConfig.shamcashMerchantName || 'ECHOCORE Store';

  const handleAmountPreset = (amt) => {
    setSelectedAmount(amt);
    setCustomAmount('');
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setCustomAmount(val);
    if (val) setSelectedAmount(0);
  };

  const startRecharge = () => {
    if (!isValidAmount || !usableMethods.length) return;
    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      notifyError(lang === 'ar' ? 'اختر طريقة دفع متاحة' : 'Select an available payment method');
      return;
    }
    setPendingShamRef(`ECHOCORE-${Date.now().toString().slice(-7)}`);
    setShowSimModal(true);
    setSimRef('');
  };

  const simulateApiCall = async (method, _amount) => {
    await new Promise((r) => setTimeout(r, 1200));
    const refBase = `ECHOCORE-${Date.now().toString(36).toUpperCase()}`;

    if (method === 'ShamCash') {
      return {
        success: true,
        reference: refBase,
        note: 'ShamCash payment reference',
        merchant: merchantName,
      };
    }

    throw new Error(lang === 'ar' ? 'طريقة الدفع غير متاحة' : 'Payment method unavailable');
  };

  const confirmSimulatedPayment = async () => {
    if (!isValidAmount || !user?.id) {
      notifyError(lang === 'ar' ? 'مبلغ غير صالح أو لم تسجل الدخول' : 'Invalid amount or not logged in');
      return;
    }

    setIsProcessing(true);
    try {
      const result = await simulateApiCall(selectedMethod, effectiveAmount);
      await onRechargeComplete(effectiveAmount, selectedMethod, result.reference);
      setSimRef(result.reference);
      setTimeout(() => {
        setShowSimModal(false);
        setIsProcessing(false);
        setSimRef('');
      }, 900);
    } catch (err) {
      notifyError(`${t.rechargeFailed || 'Recharge failed'}: ${err.message || ''}`);
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/')}
        className="mb-6 flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-[var(--accent)]"
      >
        <ArrowLeft className="w-4 h-4" /> {t.backToHome || (lang === 'ar' ? 'العودة للرئيسية' : 'Back to Home')}
      </button>

      <div className="card p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black mb-2">{t.rechargeTitle || (lang === 'ar' ? 'شحن الرصيد' : 'Recharge Balance')}</h1>
          <p className="text-[var(--text-sec)]">{t.rechargeSubtitle || (lang === 'ar' ? 'اشحن رصيد حسابك لاستخدامه في الشراء الفوري من المتجر' : 'Top up your account balance to use for instant purchases')}</p>
        </div>

        <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] text-center">
          <div className="text-sm text-[var(--text-muted)] mb-1">{t.currentBalance || (lang === 'ar' ? 'رصيدك الحالي' : 'Current Balance')}</div>
          <div className="text-5xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</div>
        </div>

        <div className="mb-8">
          <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.chooseAmount || (lang === 'ar' ? 'اختر المبلغ' : 'Choose Amount')}</div>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3 mb-4">
            {presetAmounts.map((amt) => (
              <button
                key={amt}
                onClick={() => handleAmountPreset(amt)}
                className={`py-3 rounded-2xl border font-bold transition-all ${(!customAmount && selectedAmount === amt) ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
              >
                ${amt}
              </button>
            ))}
          </div>
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.customAmount || (lang === 'ar' ? 'مبلغ مخصص (USD)' : 'Custom amount (USD)')}</label>
            <input
              type="text"
              value={customAmount}
              onChange={handleCustomChange}
              placeholder={t.enterAmount}
              className="w-full bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-2xl px-4 py-3 text-xl font-mono outline-none"
            />
          </div>
        </div>

        <div className="mb-8">
          <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.paymentMethod || 'Payment Method'}</div>
          <div className="space-y-3">
            {paymentMethods.map((method) => {
              const Icon = method.icon;
              const active = selectedMethod === method.id;
              const isDisabled = method.disabled || method.comingSoon;
              return (
                <div
                  key={method.id}
                  onClick={() => !isDisabled && setSelectedMethod(method.id)}
                  className={`flex items-center p-4 rounded-2xl border transition-all ${
                    isDisabled
                      ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                      : `cursor-pointer ${active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`
                  }`}
                >
                  <Icon className={`w-8 h-8 ${method.color} mx-4 flex-shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold flex items-center gap-2">
                      {method.name}
                      {method.comingSoon && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                          {t.comingSoon || (lang === 'ar' ? 'قريباً' : 'Coming soon')}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{method.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={startRecharge}
          disabled={!isValidAmount || isProcessing || !user || !usableMethods.length}
          className="btn btn-primary w-full py-4 text-lg font-black disabled:opacity-60"
        >
          {t.rechargeNow || (lang === 'ar' ? 'شحن الرصيد الآن' : 'Recharge Now')} — ${effectiveAmount.toFixed(2)}
        </button>

        <div className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
          {t.rechargeNote || (lang === 'ar' ? 'الرصيد يُضاف فوراً بعد تأكيد الدفع.' : 'Balance is added instantly after payment confirmation.')}
        </div>
      </div>

      {showSimModal && selectedMethod === 'ShamCash' && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4" onClick={() => !isProcessing && setShowSimModal(false)}>
          <div className="card w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-xl mb-1 text-center">{lang === 'ar' ? 'تأكيد الدفع عبر ShamCash' : 'Confirm ShamCash Payment'}</h3>
            <p className="text-center text-sm mb-6 text-[var(--text-sec)]">${effectiveAmount.toFixed(2)} → {merchantName}</p>

            <div className="bg-black/60 p-4 rounded-2xl mb-5 text-center">
              <div className="text-green-400 text-sm mb-1">SHAMCASH REFERENCE</div>
              <div className="font-mono text-lg tracking-wider mb-2">{pendingShamRef || simRef}</div>
              <p className="text-xs text-[var(--text-muted)]">
                {lang === 'ar'
                  ? 'افتح تطبيق ShamCash وادفع لهذا المرجع. اضغط تأكيد بعد الدفع.'
                  : 'Open the ShamCash app and pay using this reference. Tap confirm after payment.'}
              </p>
            </div>

            {!simRef && (
              <button
                onClick={confirmSimulatedPayment}
                disabled={isProcessing}
                className="btn btn-primary w-full py-4 font-bold flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {lang === 'ar' ? 'جاري المعالجة...' : 'Processing...'}</>
                ) : (
                  t.confirmPayment || (lang === 'ar' ? 'تأكيد الدفع وشحن الرصيد' : 'Confirm & Credit Balance')
                )}
              </button>
            )}

            {simRef && (
              <div className="text-center py-3">
                <CheckCircle className="w-8 h-8 mx-auto text-emerald-400 mb-2" />
                <div className="font-bold">{lang === 'ar' ? 'تمت عملية الشحن بنجاح!' : 'Recharge Successful!'}</div>
                <div className="text-xs text-[var(--text-muted)] mt-1 font-mono">{simRef}</div>
              </div>
            )}

            {!isProcessing && (
              <button onClick={() => setShowSimModal(false)} className="mt-4 w-full text-xs text-[var(--text-sec)] hover:text-white">
                {t.cancel || 'Cancel'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}