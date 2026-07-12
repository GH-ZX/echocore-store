import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, Loader2, QrCode, Clock, CheckCircle, Gift } from 'lucide-react';
import {
  buildPaymentMethods,
  getDefaultPaymentMethod,
  getManualPaymentDisplay,
  isManualWalletMethod,
  isApiWalletMethod,
  isPaymentMethodReady,
} from '../lib/paymentMethods';
import SamInvoicePaymentPanel from '../components/SamInvoicePaymentPanel';
import { markOrderPaymentSent } from '../lib/orders';
import { formatMessage } from '../lib/i18n';
import { getAdminGiftPath, getAdminDashboardPath } from '../lib/adminRoutes';

export default function CheckoutView({
  t,
  lang = 'ar',
  user,
  cart,
  submitOrder,
  onComplete,
  onOrderPaid,
  currentBalance = 0,
  paymentConfig = {},
  onNotify,
  navigate,
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');

  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState('method');
  const [activeOrder, setActiveOrder] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('balance');

  const totalNum = cart.reduce((s, i) => s + parseFloat(i.price), 0);
  const total = totalNum.toFixed(2);
  const hasEnoughBalance = currentBalance >= totalNum;

  const allMethods = useMemo(
    () => buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance: hasEnoughBalance ? currentBalance : 0 }),
    [t, lang, paymentConfig, hasEnoughBalance, currentBalance],
  );

  const usableMethods = allMethods.filter((m) => !m.disabled && !m.comingSoon);

  useEffect(() => {
    const methods = buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance });
    setSelectedMethod(hasEnoughBalance ? 'balance' : getDefaultPaymentMethod(methods));
  }, [t, lang, paymentConfig, hasEnoughBalance, currentBalance]);

  useEffect(() => {
    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(hasEnoughBalance ? 'balance' : getDefaultPaymentMethod(allMethods));
    }
  }, [allMethods, selectedMethod, usableMethods, hasEnoughBalance]);

  const paymentMethod = activeOrder?.paymentMethod || selectedMethod;
  const isApiWallet = isApiWalletMethod(paymentMethod, paymentConfig);
  const paymentDisplay = getManualPaymentDisplay(paymentConfig, paymentMethod);
  const methodLabel = t[paymentDisplay.methodLabelKey] || paymentMethod;
  const methodReady = isPaymentMethodReady(paymentMethod, paymentConfig);

  const handleCheckoutProcess = async () => {
    if (selectedMethod === 'balance') {
      setIsProcessing(true);
      try {
        const result = await submitOrder(cart, selectedMethod);
        onComplete(result);
      } catch (e) {
        notifyError(`${t.checkoutFailed || 'Checkout failed'}: ${e.message || ''}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      notifyError(t.paymentMethodUnavailable);
      return;
    }

    if (isManualWalletMethod(selectedMethod) && !methodReady) {
      notifyError(t.walletBuyNotConfigured);
      return;
    }

    setIsProcessing(true);
    try {
      const result = await submitOrder(cart, selectedMethod);
      if (result?.orderId) {
        setActiveOrder({
          orderId: result.orderId,
          reference: result.reference,
          total: totalNum,
          status: result.status || 'pending_payment',
          invoice: result.invoice || null,
          paymentMethod: selectedMethod,
        });
        setStep('payment');
      } else {
        onComplete(result);
      }
    } catch (e) {
      notifyError(`${t.paymentFailed || 'Payment failed'}: ${e.message || ''}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const confirmPaymentSent = async () => {
    if (!activeOrder?.orderId) return;

    setIsProcessing(true);
    try {
      const result = await markOrderPaymentSent(activeOrder.orderId);
      setActiveOrder((prev) => ({ ...prev, ...result, status: 'payment_sent' }));
      notifySuccess(t.orderPendingApproval);
    } catch (e) {
      notifyError(e.message || t.paymentFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleInvoicePaid = async () => {
    const orderId = activeOrder?.orderId;
    if (!orderId) return;
    try {
      await onOrderPaid?.(orderId);
    } catch {
      /* fulfillment surfaced elsewhere */
    }
    onComplete({ orderId, status: 'completed' });
  };

  if (user?.role === 'admin') {
    return (
      <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
        <div className="card p-8 md:p-10 text-center border border-pink-500/20 bg-pink-500/5">
          <Gift className="w-12 h-12 mx-auto text-pink-300 mb-4" />
          <h2 className="text-2xl font-black mb-2">{t.adminCannotPurchaseTitle}</h2>
          <p className="text-sm text-[var(--text-sec)] leading-relaxed max-w-md mx-auto mb-6">
            {t.adminCannotPurchaseDesc}
          </p>
          {navigate && (
            <button
              type="button"
              onClick={() => navigate(getAdminGiftPath({ returnTo: getAdminDashboardPath('users') }))}
              className="btn btn-primary"
            >
              {t.adminGiftProduct}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (step === 'payment' && activeOrder) {
    return (
      <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
        <button
          type="button"
          onClick={() => { setStep('method'); setActiveOrder(null); }}
          className="flex items-center gap-2 mb-4 text-sm text-[var(--text-sec)] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </button>

        <div className="card p-8 md:p-10">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black mb-1">{formatMessage(t.completeWalletPayment, { method: methodLabel })}</h2>
            <div className="text-sm text-[var(--text-sec)]">
              {t.orderTotal}: <span className="font-mono font-bold text-[var(--accent)]">${total}</span>
            </div>
          </div>

          {isApiWallet && activeOrder.invoice ? (
            <SamInvoicePaymentPanel
              t={t}
              lang={lang}
              total={activeOrder.total}
              methodLabel={methodLabel}
              invoice={activeOrder.invoice}
              onPaid={handleInvoicePaid}
              onExpired={() => { setStep('method'); setActiveOrder(null); }}
              onNotify={onNotify}
            />
          ) : (
            <>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-center mb-5">
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-semibold mb-4">
                  <QrCode className="w-4 h-4" />
                  {methodLabel}
                </div>
                {paymentDisplay.qrImageUrl ? (
                  <img
                    src={paymentDisplay.qrImageUrl}
                    alt=""
                    className="mx-auto max-w-[220px] w-full rounded-xl border border-[var(--border)] bg-white p-2"
                  />
                ) : (
                  <div className="py-8 text-sm text-[var(--text-muted)]">{t.qrNotConfigured}</div>
                )}
                {paymentDisplay.payCode && (
                  <div className="mt-4">
                    <div className="text-xs text-[var(--text-muted)] mb-1">{t.shamcashPayCodeLabel}</div>
                    <div className="font-mono text-lg tracking-wide break-all bg-black/30 rounded-xl px-4 py-3">
                      {paymentDisplay.payCode}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-center mb-5">
                <div className="text-green-400 text-xs mb-1 uppercase tracking-wider">{t.paymentReference}</div>
                <div className="font-mono text-lg tracking-wider">{activeOrder.reference || '—'}</div>
              </div>

              {activeOrder.status === 'payment_sent' ? (
                <div className="text-center py-4 rounded-2xl border border-amber-500/30 bg-amber-500/10">
                  <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                  <div className="font-bold text-amber-100">{t.awaitingAdminApproval}</div>
                  <p className="text-xs text-[var(--text-sec)] mt-2">{t.orderPendingDesc}</p>
                  <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mt-3" />
                </div>
              ) : (
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
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in">
      <div className="card p-8 md:p-12">
        <h2 className="text-3xl font-black mb-2 text-center">{t.paymentMethod}</h2>
        <div className="text-center text-sm text-[var(--text-sec)] mb-3">
          {t.orderTotal}: <span className="font-mono font-bold text-[var(--accent)]">${total}</span>
        </div>
        <div className="text-center text-xs mb-6 text-[var(--text-muted)]">
          <span>{t.currentBalance}:</span> <span className="font-mono">${currentBalance.toFixed(2)}</span>
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
                    {method.manualOnlyKey && (
                      <span className="text-[10px] text-[var(--text-muted)] font-normal">{t[method.manualOnlyKey]}</span>
                    )}
                    {method.comingSoon && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                        {t.comingSoon}
                      </span>
                    )}
                  </div>
                  {isBalance && (
                    <div className="text-[10px] text-emerald-400">{t.balanceUsed}</div>
                  )}
                </div>
                {isBalance && !hasEnoughBalance && (
                  <div className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400">{t.insufficientBalance}</div>
                )}
              </div>
            );
          })}
        </div>

        <button
          onClick={handleCheckoutProcess}
          disabled={
            isProcessing
            || cart.length === 0
            || (selectedMethod === 'balance' && !hasEnoughBalance)
            || (selectedMethod !== 'balance' && !usableMethods.some((m) => m.id === selectedMethod))
            || (isManualWalletMethod(selectedMethod) && !isPaymentMethodReady(selectedMethod, paymentConfig))
          }
          className="btn btn-primary w-full py-5 text-xl font-black disabled:opacity-60"
        >
          {isProcessing ? t.processing : (selectedMethod === 'balance' ? t.payFromBalance : t.payNow)}
        </button>

        <div className="text-center text-xs text-[var(--text-muted)] mt-4">
          {selectedMethod === 'balance'
            ? t.balanceUsed
            : (isApiWalletMethod(selectedMethod, paymentConfig) ? t.samInvoiceCheckoutNote : t.instantDeliveryNote)}
        </div>
      </div>
    </div>
  );
}