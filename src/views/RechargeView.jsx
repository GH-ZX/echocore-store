import { useState, useEffect, useMemo } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle, Wallet, QrCode, Clock, AlertCircle, Info } from 'lucide-react';
import {
  RECHARGE_PRESETS,
  validateRechargeAmount,
  createRechargeRequest,
  markRechargePaymentSent,
  getMyActiveRechargeRequest,
  cancelMyRechargeRequest,
  canUserRecharge,
} from '../lib/recharge';
import {
  buildPaymentMethods,
  getDefaultPaymentMethod,
  getManualPaymentDisplay,
  hasAnyManualWalletReady,
  isApiWalletMethod,
  isApiWalletMode,
  isPaymentMethodReady,
} from '../lib/paymentMethods';
import { createRechargeInvoice, mapSamRechargeError } from '../lib/samApi';
import { logClientError } from '../lib/siteLogs';
import SamInvoicePaymentPanel from '../components/SamInvoicePaymentPanel';
import PaymentMethodIcon from '../components/ui/PaymentMethodIcon';
import {
  normalizePayCurrency,
  getSypPerUsd,
  sypForUsd,
  formatSypExchangeRate,
  formatUsdToSypConversion,
  isSypRateRecentlyUpdated,
  buildRechargeCompletedMessage,
} from '../lib/rechargeCurrency';
import { formatMessage } from '../lib/i18n';

async function cancelPendingRecharge(requestId) {
  if (!requestId) return;
  try {
    await cancelMyRechargeRequest(requestId);
  } catch (err) {
    console.error('Failed to cancel pending recharge:', err);
  }
}

export default function RechargeView({
  t,
  lang,
  navigate,
  user,
  currentBalance,
  paymentConfig = {},
  onNotify,
  onRechargePaid,
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');
  const location = useLocation();
  const returnTo = location.state?.returnTo;

  const balance = typeof currentBalance === 'number' ? currentBalance : (user?.balance || 0);
  const isApiMode = isApiWalletMode(paymentConfig);
  const rechargeAllowed = canUserRecharge(user);

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
  const [invoiceError, setInvoiceError] = useState('');
  const [completedRecharge, setCompletedRecharge] = useState(null);
  const [payCurrency, setPayCurrency] = useState('USD');

  const sypPerUsd = getSypPerUsd(paymentConfig);
  const sypRechargeAvailable = isApiMode && sypPerUsd != null;
  const methodReady = isPaymentMethodReady(selectedMethod, paymentConfig);
  const anyReady = hasAnyManualWalletReady(paymentConfig);
  const paymentDisplay = getManualPaymentDisplay(paymentConfig, selectedMethod);
  const methodLabel = t[paymentDisplay.methodLabelKey] || selectedMethod;

  const effectiveAmount = customMode && customAmount
    ? parseFloat(customAmount)
    : selectedAmount;
  const { valid: isValidAmount } = validateRechargeAmount(effectiveAmount);

  const rechargeSubtitle = isApiMode ? t.rechargeApiSubtitle : t.rechargeSyriaSubtitle;
  const methodNoteKey = isApiMode ? 'samInvoiceRechargeNote' : 'manualPaymentApprovalNote';
  const amountFooterNote = isApiMode ? t.samInvoiceRechargeNote : t.rechargeManualNote;

  useEffect(() => {
    if (!usableWalletMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(getDefaultPaymentMethod(walletMethods));
    }
  }, [walletMethods, usableWalletMethods, selectedMethod]);

  useEffect(() => {
    if (!rechargeAllowed) {
      setLoadingRequest(false);
      return undefined;
    }

    let cancelled = false;

    (async () => {
      try {
        let existing = await getMyActiveRechargeRequest();
        if (cancelled) return;

        if (!existing?.requestId) return;

        if (existing.paymentMethod) {
          setSelectedMethod(existing.paymentMethod);
        }
        if (existing.payCurrency) {
          setPayCurrency(normalizePayCurrency(existing.payCurrency));
        }

        const apiWallet = isApiWalletMethod(existing.paymentMethod, paymentConfig);

        if (apiWallet) {
          if (!existing.invoice?.samInvoiceId) {
            try {
              const invoice = await createRechargeInvoice({
                requestId: existing.requestId,
                paymentMethod: existing.paymentMethod,
              });
              existing = { ...existing, invoice };
              setInvoiceError('');
            } catch (err) {
              console.error('Failed to resume recharge invoice:', err);
              await cancelPendingRecharge(existing.requestId);
              if (!cancelled) {
                setInvoiceError(mapSamRechargeError(err, t));
              }
              existing = null;
            }
          }

          if (existing) {
            setActiveRequest(existing);
            setStep('payment');
          }
          return;
        }

        setActiveRequest(existing);
        setStep(existing.status === 'payment_sent' ? 'pending' : 'payment');
      } catch (err) {
        console.error('Failed to load active recharge request:', err);
      } finally {
        if (!cancelled) setLoadingRequest(false);
      }
    })();

    return () => { cancelled = true; };
  }, [paymentConfig, t, rechargeAllowed]);

  const handleAmountPreset = (amt) => {
    setCustomMode(false);
    setCustomAmount('');
    setSelectedAmount(amt);
  };

  const handleCustomChange = (e) => {
    const val = e.target.value.replace(/[^0-9.]/g, '');
    setCustomAmount(val);
  };

  const startPayment = async () => {
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
    setInvoiceError('');

    try {
      const result = await createRechargeRequest(
        effectiveAmount,
        selectedMethod,
        sypRechargeAvailable ? payCurrency : 'USD',
      );
      const apiWallet = isApiWalletMethod(selectedMethod, paymentConfig);

      if (apiWallet) {
        try {
          const invoice = await createRechargeInvoice({
            requestId: result.requestId,
            paymentMethod: selectedMethod,
          });
          setActiveRequest({ ...result, invoice });
          setStep('payment');
        } catch (invoiceErr) {
          await cancelPendingRecharge(result.requestId);
          notifyError(mapSamRechargeError(invoiceErr, t));
          logClientError('recharge_invoice_failed', {
            severity: 'danger',
            error: invoiceErr,
            metadata: {
              paymentMethod: selectedMethod,
              requestId: result.requestId,
              amount: effectiveAmount,
            },
          });
        }
        return;
      }

      setActiveRequest(result);
      setStep('payment');
    } catch (err) {
      notifyError(err.message || t.rechargeFailed);
      logClientError('recharge_failed', {
        severity: 'danger',
        error: err,
        metadata: {
          paymentMethod: selectedMethod,
          amount: effectiveAmount,
        },
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPaymentSent = async () => {
    if (!activeRequest?.requestId || isApiWalletMethod(activeRequest.paymentMethod, paymentConfig)) {
      return;
    }

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

  const handleInvoicePaid = (completion) => {
    const creditedAmount = completion?.creditedAmount ?? completion?.amount ?? activeRequest?.amount;
    const requestedAmount = completion?.requestedAmount ?? activeRequest?.amount;
    const newBalance = completion?.newBalance;

    if (newBalance != null) {
      onRechargePaid?.({
        userId: completion?.userId || user?.id,
        newBalance,
        amount: creditedAmount,
      });
    }

    setCompletedRecharge({
      requestId: completion?.requestId || activeRequest?.requestId,
      amount: creditedAmount,
      requestedAmount,
      creditedAmount,
      paidAmount: completion?.paidAmount,
      payCurrency: completion?.payCurrency || activeRequest?.payCurrency,
      sypPerUsd: completion?.sypPerUsd ?? activeRequest?.sypPerUsd,
      newBalance: newBalance ?? balance,
    });
    setActiveRequest(null);
    setInvoiceError('');
    setStep('completed');
    notifySuccess(t.rechargeSuccess);

    if (returnTo) {
      window.setTimeout(() => {
        navigate(returnTo);
      }, 1400);
    }
  };

  const handleInvoiceExpired = () => {
    setActiveRequest(null);
    setInvoiceError('');
    setStep('amount');
  };

  const resetToAmount = async () => {
    if (
      activeRequest?.requestId
      && isApiWalletMethod(activeRequest.paymentMethod, paymentConfig)
      && step !== 'completed'
    ) {
      await cancelPendingRecharge(activeRequest.requestId);
    }
    setStep('amount');
    setActiveRequest(null);
    setInvoiceError('');
    setCompletedRecharge(null);
  };

  const activeMethod = activeRequest?.paymentMethod || selectedMethod;
  const activeDisplay = getManualPaymentDisplay(paymentConfig, activeMethod);
  const activeMethodLabel = t[activeDisplay.methodLabelKey] || activeMethod;
  const activeIsApiWallet = isApiWalletMethod(activeMethod, paymentConfig);
  const activeInvoice = activeRequest?.invoice;
  const activePayCurrency = normalizePayCurrency(activeRequest?.payCurrency || payCurrency);
  const activeSypRate = activeRequest?.sypPerUsd || sypPerUsd;
  const activeSypSendAmount = activePayCurrency === 'SYP' && activeSypRate
    ? (activeInvoice?.amount ?? sypForUsd(activeRequest?.amount, activeSypRate))
    : null;
  const effectivePayCurrency = normalizePayCurrency(payCurrency);
  const previewSypSendAmount = effectivePayCurrency === 'SYP' && sypPerUsd && isValidAmount
    ? sypForUsd(effectiveAmount, sypPerUsd)
    : null;
  const showShamcashGuide = step !== 'completed'
    && (selectedMethod === 'ShamCash' || activeMethod === 'ShamCash');
  const shamcashGuideSteps = t.rechargeShamcashGuideSteps || [];

  if (loadingRequest) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
      </div>
    );
  }

  if (!rechargeAllowed) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <AlertCircle className="w-10 h-10 mx-auto text-amber-300 mb-4" />
        <p className="text-[var(--text-sec)] mb-6">{t.adminRechargeNotAllowed}</p>
        <button
          type="button"
          onClick={() => navigate('/dashboard/payments')}
          className="btn btn-primary"
        >
          {t.adminDash}
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button
        type="button"
        onClick={() => navigate(returnTo || '/')}
        className="mb-6 flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-[var(--accent)]"
      >
        <ArrowLeft className="w-4 h-4" /> {returnTo ? t.back : t.backToHome}
      </button>

      <div className="card p-8 md:p-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--accent)]/10 text-[var(--accent)] mb-4">
            <Wallet className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-black mb-2">{t.rechargeTitle}</h1>
          <p className="text-[var(--text-sec)]">{rechargeSubtitle}</p>
        </div>

        {showShamcashGuide && shamcashGuideSteps.length > 0 && (
          <div className="mb-8 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-5 sm:p-6">
            <div className="flex items-start gap-3 mb-4">
              <Info className="w-5 h-5 text-[var(--accent)] flex-shrink-0 mt-0.5" aria-hidden="true" />
              <h2 className="font-bold text-sm sm:text-base text-[var(--text-primary)]">
                {t.rechargeShamcashGuideTitle}
              </h2>
            </div>
            <ol className="space-y-2.5 text-sm text-[var(--text-sec)] leading-relaxed list-decimal list-inside marker:text-[var(--accent)] marker:font-semibold">
              {shamcashGuideSteps.map((stepText) => (
                <li key={stepText}>{stepText}</li>
              ))}
            </ol>
            {t.rechargeShamcashGuideRefNote && (
              <p className="mt-4 text-xs text-[var(--accent)] font-medium leading-relaxed">
                {t.rechargeShamcashGuideRefNote}
              </p>
            )}
          </div>
        )}

        <div className="mb-8 p-6 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] text-center">
          <div className="text-sm text-[var(--text-muted)] mb-1">{t.currentBalance}</div>
          <div className="text-5xl font-black font-mono text-[var(--accent)]">${balance.toFixed(2)}</div>
        </div>

        {!anyReady && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t.rechargeNotConfigured}
          </div>
        )}

        {invoiceError && step === 'amount' && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {invoiceError}
          </div>
        )}

        {step === 'completed' && completedRecharge && (
          <div className="text-center space-y-5">
            <div className="py-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10">
              <CheckCircle className="w-12 h-12 mx-auto text-emerald-400 mb-4" />
              <div className="text-2xl font-black text-emerald-100 mb-2">{t.rechargeSuccess}</div>
              <p className="text-sm text-[var(--text-sec)] max-w-sm mx-auto">
                {buildRechargeCompletedMessage({
                  completed: completedRecharge,
                  t,
                  formatMessage,
                })}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              {completedRecharge.requestId && (
                <button
                  type="button"
                  onClick={() => navigate(`/invoice/recharge/${completedRecharge.requestId}`)}
                  className="btn btn-primary flex-1 py-4 font-bold"
                >
                  {t.viewInvoice}
                </button>
              )}
              <button
                type="button"
                onClick={resetToAmount}
                className="btn btn-secondary flex-1 py-4 font-bold"
              >
                {t.rechargeAgain}
              </button>
            </div>
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

            {sypRechargeAvailable && (
              <div className="mb-6">
                <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.rechargePayCurrencyLabel}</div>
                <div className="grid grid-cols-2 gap-3">
                  {['USD', 'SYP'].map((code) => {
                    const active = payCurrency === code;
                    return (
                      <button
                        key={code}
                        type="button"
                        onClick={() => setPayCurrency(code)}
                        className={`py-3 rounded-2xl border font-bold transition-all ${
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                            : 'border-[var(--border)] hover:border-[var(--accent)]/60'
                        }`}
                      >
                        {code === 'USD' ? t.rechargePayCurrencyUsd : t.rechargePayCurrencySyp}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[10px] text-[var(--text-muted)] mt-2" dir="ltr">
                  {formatMessage(t.rechargeSypRateNote, { rate: formatSypExchangeRate(sypPerUsd) })}
                </p>
                {isSypRateRecentlyUpdated(paymentConfig) && (
                  <p className="text-[10px] text-amber-200/90 mt-1">{t.rechargeSypRateUpdatedNote}</p>
                )}
              </div>
            )}

            <div className="mb-6">
              <div className="text-sm font-semibold mb-3 text-[var(--text-sec)]">{t.paymentMethod}</div>
              <div className="space-y-2">
                {walletMethods.map((m) => {
                  const active = selectedMethod === m.id;
                  const isDisabled = m.disabled;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      disabled={isDisabled}
                      onClick={() => !isDisabled && setSelectedMethod(m.id)}
                      className={`w-full flex items-center p-4 rounded-2xl border transition text-start ${
                        isDisabled
                          ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                          : active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                            : 'border-[var(--border)] hover:border-[var(--accent)]/60'
                      }`}
                    >
                      <span className={`payment-method-icon-wrap me-3 flex-shrink-0 ${m.color || ''}`}>
                        <PaymentMethodIcon method={m} className="w-8 h-8" />
                      </span>
                      <div className="min-w-0">
                        <div className="font-bold">{m.name}</div>
                        <div className="text-xs text-[var(--text-muted)]">{t[methodNoteKey]}</div>
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
              {previewSypSendAmount != null && (
                <div className="text-sm font-mono text-[var(--text-sec)] mt-2" dir="ltr">
                  {formatMessage(t.rechargeSypSendAmount, {
                    conversion: formatUsdToSypConversion(
                      isValidAmount ? effectiveAmount : 0,
                      previewSypSendAmount,
                    ),
                  })}
                </div>
              )}
              <div className="text-xs text-[var(--text-muted)] mt-1">{methodLabel}</div>
              {effectivePayCurrency === 'SYP' && (
                <p className="text-[10px] text-[var(--text-muted)] mt-2 max-w-md mx-auto">{t.rechargeSypPartialCreditNote}</p>
              )}
              {effectivePayCurrency === 'USD' && isApiMode && (
                <p className="text-[10px] text-[var(--text-muted)] mt-2 max-w-md mx-auto">{t.rechargeUsdPartialCreditNote}</p>
              )}
            </div>

            <button
              type="button"
              onClick={startPayment}
              disabled={!isValidAmount || isProcessing || !user || !methodReady}
              className="btn btn-primary w-full py-4 text-lg font-black disabled:opacity-60"
            >
              {isProcessing ? t.processing : `${t.continueToPayment} — $${isValidAmount ? effectiveAmount.toFixed(2) : '0.00'}`}
            </button>

            <div className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
              {amountFooterNote}
            </div>
          </>
        )}

        {(step === 'payment' || step === 'pending') && activeRequest && (
          <div className="space-y-5">
            <button
              type="button"
              onClick={resetToAmount}
              className="flex items-center gap-2 text-sm text-[var(--text-sec)] hover:text-white"
            >
              <ArrowLeft className="w-4 h-4" /> {t.back}
            </button>

            <div className="text-center">
              <div className="text-sm text-[var(--text-muted)]">{t.rechargeAmountLabel}</div>
              <div className="text-4xl font-black font-mono text-[var(--accent)]">
                ${parseFloat(activeRequest.amount).toFixed(2)}
              </div>
              {activePayCurrency === 'SYP' && activeSypSendAmount != null && (
                <div className="text-lg font-bold font-mono text-[var(--text-primary)] mt-2" dir="ltr">
                  {formatMessage(t.rechargeSypSendAmount, {
                    conversion: formatUsdToSypConversion(activeRequest.amount, activeSypSendAmount),
                  })}
                </div>
              )}
              {activePayCurrency === 'SYP' && activeSypRate && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1" dir="ltr">
                  {formatMessage(t.rechargeSypRateNote, { rate: formatSypExchangeRate(activeSypRate) })}
                </p>
              )}
              <div className="text-xs text-[var(--text-sec)] mt-1">{activeMethodLabel}</div>
              {activePayCurrency === 'SYP' && (
                <p className="text-[10px] text-[var(--text-muted)] mt-2 max-w-md mx-auto">{t.rechargeSypPartialCreditNote}</p>
              )}
            </div>

            {activeIsApiWallet ? (
              activeInvoice?.samInvoiceId ? (
                <SamInvoicePaymentPanel
                  t={t}
                  lang={lang}
                  methodLabel={activeMethodLabel}
                  invoice={activeInvoice}
                  onPaid={handleInvoicePaid}
                  onExpired={handleInvoiceExpired}
                  onNotify={onNotify}
                  autoOpenPaymentPopup
                  paidRedirectKey="samInvoiceRechargeRedirecting"
                  expiredDescKey="samInvoiceExpiredRechargeDesc"
                  autoConfirmNoteKey="samInvoiceRechargeAutoConfirmNote"
                />
              ) : (
                <div className="text-center py-6 rounded-2xl border border-red-500/30 bg-red-500/10">
                  <AlertCircle className="w-10 h-10 mx-auto text-red-300 mb-3" />
                  <div className="font-bold text-red-100">{t.samInvoiceUnavailable}</div>
                  <p className="text-xs text-[var(--text-sec)] mt-2 max-w-sm mx-auto">
                    {invoiceError || t.samInvoiceCreateFailed}
                  </p>
                  <button
                    type="button"
                    onClick={resetToAmount}
                    className="btn btn-secondary mt-4 px-6 py-2"
                  >
                    {t.back}
                  </button>
                </div>
              )
            ) : (
              <>
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
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}