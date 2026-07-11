import { useState, useEffect, useMemo } from 'react';
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
import {
  buildPaymentMethods,
  getDefaultPaymentMethod,
  getManualPaymentDisplay,
  hasAnyManualWalletReady,
  isPaymentMethodReady,
} from '../lib/paymentMethods';
import { formatMessage } from '../lib/i18n';

export default function RechargeView({ t, lang, navigate, user, currentBalance, paymentConfig = {}, onNotify }) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');

  const balance = typeof currentBalance === 'number' ? currentBalance : (user?.balance || 0);

  const walletMethods = useMemo(
    () => buildPaymentMethods(t, lang, paymentConfig).filter((m) => m.id === 'ShamCash' || m.id === 'SyriatelCash'),
    [t, lang, paymentConfig],
  );
  const usableWalletMethods = walletMethods.filter((m) => !m.disabled);

  const [selectedMethod, setSelectedMethod] = useState(() => getDefaultPaymentMethod(walletMethods));
  const [step, setStep] = useState('amount');
  const [selectedAmount, setSelectedAmount] = useState(10);
  const [customMode, setCustomMode] = useState(false);
  const [customAmount, setCustomAmount] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState(true);
  const [activeRequest, setActiveRequest] = useState(null);

  const methodReady = isPaymentMethodReady(selectedMethod, paymentConfig);
  const anyReady = hasAnyManualWalletReady(paymentConfig);
  const paymentDisplay = getManualPaymentDisplay(paymentConfig, selectedMethod);
  const methodLabel = t[paymentDisplay.methodLabelKey] || selectedMethod;

  const effectiveAmount = customMode && customAmount
    ? parseFloat(customAmount)
    : selectedAmount;
  const { valid: isValidAmount } = validateRechargeAmount(effectiveAmount);

  useEffect(() => {
    if (!usableWalletMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(getDefaultPaymentMethod(walletMethods));
    }
  }, [walletMethods, usableWalletMethods, selectedMethod]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const existing = await getMyActiveRechargeRequest();
        if (cancelled) return;
        if (existing?.requestId) {
          setActiveRequest(existing);
          if (existing.paymentMethod) {
            setSelectedMethod(existing.paymentMethod);
          }
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
      notifyError(t.loginRequired);
      return;
    }
    if (!methodReady) {
      notifyError(t.rechargeNotConfigured);
      return;
    }
    if (!isValidAmount) {
      notifyError(t.rechargeAmountRange);
      return;
    }

    setIsProcessing(true);
    try {
      const result = await createRechargeRequest(effectiveAmount, selectedMethod);
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
      notifySuccess(t.rechargePendingApproval);
    } catch (err) {
      notifyError(err.message || t.rechargeFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const activeMethod = activeRequest?.paymentMethod || selectedMethod;
  const activeDisplay = getManualPaymentDisplay(paymentConfig, activeMethod);
  const activeMethodLabel = t[activeDisplay.methodLabelKey] || activeMethod;

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
        <ArrowLeft className="w-4 h-4" /> {t.backToHome}
      </button>

      <div className="card p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black mb-2">{t.rechargeTitle}</h1>
          <p className="text-[var(--text-sec)]">{t.rechargeSyriaSubtitle}</p>
        </div>

        <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] text-center">
          <div className="text-sm text-[var(--text-muted)] mb-1">{t.currentBalance}</div>
          <div className="text-5xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</div>
        </div>

        {!anyReady && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t.rechargeNotConfigured}
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
                  {t.custom}
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
                <p className="text-[10px] text-[var(--text-muted)] mt-2">{t.rechargeAmountRange}</p>
              </div>
            )}

            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.paymentMethod}</div>
              <div className="space-y-2">
                {walletMethods.map((m) => {
                  const Icon = m.icon;
                  const active = selectedMethod === m.id;
                  const isDisabled = m.disabled;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setSelectedMethod(m.id)}
                      className={`w-full flex items-center p-4 rounded-2xl border transition text-left ${
                        isDisabled
                          ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                          : active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--border)] hover:border-[var(--accent)]/60'
                      }`}
                    >
                      <Icon className={`w-7 h-7 ${m.color} mr-3 flex-shrink-0`} />
                      <div>
                        <div className="font-bold">{m.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{t.manualPaymentApprovalNote}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="text-center mb-4">
              <div className="text-sm text-[var(--text-muted)]">{t.rechargeAmountLabel}</div>
              <div className="text-3xl font-black font-mono text-[var(--accent)]">
                ${isValidAmount ? effectiveAmount.toFixed(2) : '0.00'}
              </div>
              <div className="text-xs text-[var(--text-muted)] mt-1">{methodLabel}</div>
            </div>

            <button
              type="button"
              onClick={startManualPayment}
              disabled={!isValidAmount || isProcessing || !user || !methodReady}
              className="btn btn-primary w-full py-4 text-lg font-black disabled:opacity-60"
            >
              {isProcessing ? t.processing : `${t.continueToPayment} — $${isValidAmount ? effectiveAmount.toFixed(2) : '0.00'}`}
            </button>

            <div className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
              {t.rechargeManualNote}
            </div>
          </>
        )}

        {(step === 'payment' || step === 'pending') && activeRequest && (
          <div className="space-y-5">
            <div className="text-center">
              <div className="text-sm text-[var(--text-muted)]">{t.rechargeAmountLabel}</div>
              <div className="text-4xl font-black font-mono text-[var(--accent)]">
                ${parseFloat(activeRequest.amount).toFixed(2)}
              </div>
              <div className="text-xs text-[var(--text-sec)] mt-1">{activeDisplay.merchantName}</div>
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-center">
              <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-semibold mb-4">
                <QrCode className="w-4 h-4" />
                {activeMethodLabel}
              </div>

              {activeDisplay.qrImageUrl ? (
                <img
                  src={activeDisplay.qrImageUrl}
                  alt=""
                  className="mx-auto max-w-[220px] w-full rounded-xl border border-[var(--border)] bg-white p-2"
                />
              ) : (
                <div className="py-10 text-sm text-[var(--text-muted)]">{t.qrNotConfigured}</div>
              )}

              {activeDisplay.payCode && (
                <div className="mt-4">
                  <div className="text-xs text-[var(--text-muted)] mb-1">
                    {t.shamcashPayCodeLabel}
                  </div>
                  <div className="font-mono text-lg tracking-wide break-all text-[var(--text-primary)] bg-black/30 rounded-xl px-4 py-3">
                    {activeDisplay.payCode}
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-center">
              <div className="text-green-400 text-xs mb-1 uppercase tracking-wider">
                {t.paymentReference}
              </div>
              <div className="font-mono text-lg tracking-wider">{activeRequest.reference}</div>
              <p className="text-xs text-[var(--text-muted)] mt-2">
                {formatMessage(t.includeReferenceNoteMethod, { method: activeMethodLabel })}
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
                  t.confirmPaymentSent
                )}
              </button>
            ) : (
              <div className="text-center py-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
                <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                <div className="font-bold text-amber-100">{t.awaitingAdminApproval}</div>
                <p className="text-xs text-[var(--text-sec)] mt-2 max-w-sm mx-auto">
                  {formatMessage(t.rechargePendingDescMethod, { method: activeMethodLabel })}
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