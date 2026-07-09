import { useState, useEffect } from 'react';
import { ArrowLeft, Loader2, CheckCircle, Wallet, QrCode, Clock } from 'lucide-react';
import {
  RECHARGE_PRESETS,
  RECHARGE_MIN,
  RECHARGE_MAX,
  validateRechargeAmount,
  createRechargeRequest,
  markRechargePaymentSent,
  getMyActiveRechargeRequest,
} from '../lib/recharge';

export default function RechargeView({ t, lang, navigate, user, currentBalance, paymentConfig = {}, onNotify }) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');

  const isAr = lang === 'ar';
  const balance = typeof currentBalance === 'number' ? currentBalance : (user?.balance || 0);
  const merchantName = paymentConfig.shamcashMerchantName || 'ECHOCORE Store';
  const qrImageUrl = paymentConfig.shamcashQrImageUrl || '';
  const payCode = paymentConfig.shamcashPayCode || '';
  const manualReady = !!paymentConfig.shamcashManualReady && paymentConfig.shamcash !== false;

  const [step, setStep] = useState('amount');
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [activeRequest, setActiveRequest] = useState(null);

  const effectiveAmount = customMode && customAmount
    ? parseFloat(customAmount)
    : selectedAmount;
  const { valid: isValidAmount } = validateRechargeAmount(effectiveAmount);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const existing = await getMyActiveRechargeRequest();
        if (cancelled) return;
        if (existing?.requestId) {
          setActiveRequest(existing);
          setStep(existing.status === 'payment_sent' ? 'pending' : 'payment');
        }
      } catch (err) {
        console.error('Failed to load active recharge request:', err);
      } finally {
        if (!cancelled) setLoadingRequest(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const handleAmountPreset = (amt) => {
    setCustomMode(false);
    setCustomAmount('');
    setSelectedAmount(amt);
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setCustomAmount(val);
  };

  const startManualPayment = async () => {
    if (!user?.id) {
      notifyError(isAr ? 'يجب تسجيل الدخول' : 'You must be logged in');
      return;
    }
    if (!manualReady) {
      notifyError(t.rechargeNotConfigured || (isAr ? 'شحن ShamCash غير مُعدّ بعد من الإدارة' : 'ShamCash manual recharge is not configured yet'));
      return;
    }
    if (!isValidAmount) {
      notifyError(
        t.rechargeAmountRange
          || (isAr ? `المبلغ يجب أن يكون بين $${RECHARGE_MIN} و $${RECHARGE_MAX}` : `Amount must be between $${RECHARGE_MIN} and $${RECHARGE_MAX}`),
      );
      return;
    }

    setIsProcessing(true);
    try {
      const result = await createRechargeRequest(effectiveAmount);
      setActiveRequest(result);
      setStep('payment');
    } catch (err) {
      notifyError(err.message || t.rechargeFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPaymentSent = async () => {
    if (!activeRequest?.requestId) return;

    setIsProcessing(true);
    try {
      const result = await markRechargePaymentSent(activeRequest.requestId);
      setActiveRequest(result);
      setStep('pending');
      notifySuccess(
        t.rechargePendingApproval
          || (isAr ? 'تم استلام طلبك. سيُضاف الرصيد بعد تأكيد الإدارة.' : 'Request received. Balance will be added after admin approval.'),
      );
    } catch (err) {
      notifyError(err.message || t.rechargeFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  if (loadingRequest) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="mb-6 flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-[var(--accent)]"
      >
        <ArrowLeft className="w-4 h-4" /> {t.backToHome || (isAr ? 'العودة للرئيسية' : 'Back to Home')}
      </button>

      <div className="card p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black mb-2">{t.rechargeTitle}</h1>
          <p className="text-[var(--text-sec)]">{t.rechargeManualSubtitle || t.rechargeSubtitle}</p>
        </div>

        <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] text-center">
          <div className="text-sm text-[var(--text-muted)] mb-1">{t.currentBalance}</div>
          <div className="text-5xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</div>
        </div>

        {!manualReady && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t.rechargeNotConfigured || (isAr ? 'شحن ShamCash اليدوي غير جاهز. تواصل مع الدعم.' : 'Manual ShamCash recharge is not ready. Contact support.')}
          </div>
        )}

        {step === 'amount' && (
          <>
            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.chooseAmount}</div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                {RECHARGE_PRESETS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => handleAmountPreset(amt)}
                    className={`py-3 rounded-2xl border font-bold transition-all ${
                      !customMode && selectedAmount === amt
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] hover:border-[var(--accent)]/60'
                    }`}
                  >
                    ${amt}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setCustomMode(true)}
                  className={`py-3 rounded-2xl border font-bold transition-all ${
                    customMode
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                      : 'border-[var(--border)] hover:border-[var(--accent)]/60'
                  }`}
                >
                  {t.custom || (isAr ? 'مخصص' : 'Custom')}
                </button>
              </div>
            </div>

            {customMode && (
              <div className="mb-6">
                <label className="text-xs text-[var(--text-muted)] block mb-1.5">{t.customAmount}</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={customAmount}
                  onChange={handleCustomChange}
                  placeholder={t.enterAmount}
                  className="w-full bg-[var(--bg-surface)] border border-[var(--border)] focus:border-[var(--accent)] rounded-2xl px-4 py-3 text-xl font-mono outline-none"
                />
                <p className="text-[10px] text-[var(--text-muted)] mt-2">
                  {t.rechargeAmountRange || (isAr ? `من $${RECHARGE_MIN} إلى $${RECHARGE_MAX}` : `$${RECHARGE_MIN} – $${RECHARGE_MAX}`)}
                </p>
              </div>
            )}

            <div className="mb-6 p-4 rounded-2xl border border-green-500/25 bg-green-500/5">
              <div className="text-xs text-[var(--text-muted)] mb-1">{t.paymentMethod}</div>
              <div className="font-bold text-lg text-green-400">ShamCash Pay</div>
              <div className="text-xs text-[var(--text-sec)] mt-1">
                {t.shamcashManualOnly || (isAr ? 'الدفع اليدوي عبر ShamCash فقط — يتطلب موافقة الإدارة' : 'Manual ShamCash Pay only — requires admin approval')}
              </div>
            </div>

            <div className="text-center mb-4">
              <div className="text-sm text-[var(--text-muted)]">{t.rechargeAmountLabel || (isAr ? 'مبلغ الشحن' : 'Recharge amount')}</div>
              <div className="text-3xl font-black font-mono text-[var(--accent)]">
                ${isValidAmount ? effectiveAmount.toFixed(2) : '0.00'}
              </div>
            </div>

            <button
              type="button"
              onClick={startManualPayment}
              disabled={!isValidAmount || isProcessing || !user || !manualReady}
              className="btn btn-primary w-full py-4 text-lg font-black disabled:opacity-60"
            >
              {isProcessing ? t.processing : `${t.continueToPayment || (isAr ? 'متابعة للدفع' : 'Continue to payment')} — $${isValidAmount ? effectiveAmount.toFixed(2) : '0.00'}`}
            </button>

            <div className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
              {t.rechargeManualNote || (isAr ? 'لا يُضاف الرصيد تلقائياً. تُراجع كل عملية يدوياً من الإدارة.' : 'Balance is not added automatically. Every payment is reviewed manually.')}
            </div>
          </>
        )}

        {(step === 'payment' || step === 'pending') && activeRequest && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-sm text-[var(--text-muted)]">{t.rechargeAmountLabel || (isAr ? 'مبلغ الشحن' : 'Recharge amount')}</div>
              <div className="text-4xl font-black font-mono text-[var(--accent)]">
                ${parseFloat(activeRequest.amount).toFixed(2)}
              </div>
              <div className="text-xs text-[var(--text-sec)] mt-1">{merchantName}</div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-center">
              <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-semibold mb-4">
                <QrCode className="w-4 h-4" />
                ShamCash Pay
              </div>

              {qrImageUrl ? (
                <img
                  src={qrImageUrl}
                  alt="ShamCash QR"
                  className="mx-auto max-w-[220px] w-full rounded-xl border border-[var(--border)] bg-white p-2"
                />
              ) : (
                <div className="py-10 text-sm text-[var(--text-muted)]">{t.qrNotConfigured}</div>
              )}

              {payCode && (
                <div className="mt-4">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {t.shamcashPayCodeLabel || (isAr ? 'رمز / حساب الدفع' : 'Payment code / account')}
                  </div>
                  <div className="font-mono text-lg tracking-wide break-all text-[var(--text-primary)] bg-black/30 rounded-xl px-4 py-3">
                    {payCode}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-center">
              <div className="text-green-400 text-xs mb-1 uppercase tracking-wider">
                {t.paymentReference || (isAr ? 'مرجع الدفع' : 'Payment reference')}
              </div>
              <div className="font-mono text-lg tracking-wider">{activeRequest.reference}</div>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {t.includeReferenceNote
                  || (isAr ? 'أرسل المبلغ عبر ShamCash مع هذا المرجع في الملاحظة إن أمكن.' : 'Send the exact amount via ShamCash and include this reference in the note if possible.')}
              </p>
            </div>

            {step === 'payment' ? (
              <button
                type="button"
                onClick={confirmPaymentSent}
                disabled={isProcessing}
                className="btn btn-primary w-full py-4 font-bold flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {t.processing}</>
                ) : (
                  t.confirmPaymentSent || (isAr ? 'لقد أرسلت الدفع' : 'I have sent the payment')
                )}
              </button>
            ) : (
              <div className="text-center py-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
                <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                <div className="font-bold text-amber-100">{t.awaitingAdminApproval || (isAr ? 'بانتظار موافقة الإدارة' : 'Awaiting admin approval')}</div>
                <p className="text-xs text-[var(--text-sec)] mt-2 max-w-sm mx-auto">
                  {t.rechargePendingDesc
                    || (isAr ? 'سيُضاف الرصيد إلى حسابك بعد أن يتحقق المسؤول من استلام المبلغ في ShamCash.' : 'Your balance will be credited after an admin verifies the ShamCash payment.')}
                </p>
                <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mt-3" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}