import { useState, useEffect, useMemo, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2, QrCode, Clock, CheckCircle, Gift, Wallet, Check } from 'lucide-react';
import {
  buildPaymentMethods,
  getManualPaymentDisplay,
  isManualWalletMethod,
  isApiWalletMethod,
  isPaymentMethodReady,
} from '../lib/paymentMethods';
import SamInvoicePaymentPanel from '../components/SamInvoicePaymentPanel';
import PaymentMethodIcon from '../components/ui/PaymentMethodIcon';
import AlertBanner from '../components/ui/AlertBanner';
import { markOrderPaymentSent } from '../lib/orders';
import { formatMessage, formatMoney } from '../lib/i18n';
import { getAdminGiftPath, getAdminDashboardPath } from '../lib/adminRoutes';
import {
  getFulfillmentUnavailableMessage,
  inspectFulfillmentAvailability,
} from '../lib/fulfillmentAvailability';
import { isCommerceBlockedDuringMaintenance } from '../lib/siteStatus';
import { useNotify } from '../hooks/useNotify';
import BackButton from '../components/ui/BackButton';
import MobileBuyBar from '../components/catalog/MobileBuyBar';
import CopyButton from '../components/ui/CopyButton';
import { getOfferDisplayName } from '../lib/offerDisplay';
import { brandUserText } from '../lib/branding';

export default function CheckoutView({
  t,
  lang = 'ar',
  user,
  cart,
  games = [],
  offers = [],
  submitOrder,
  onComplete,
  onOrderPaid,
  currentBalance = 0,
  paymentConfig = {},
  onNotify,
  navigate,
  siteStatus = null,
}) {
  const { notifyError, notifySuccess } = useNotify(onNotify);

  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState('method');
  const [activeOrder, setActiveOrder] = useState(null);
  const [selectedMethod, setSelectedMethod] = useState('balance');
  const [stockCheck, setStockCheck] = useState({ loading: false, available: true, message: '' });
  /** Extra client guard — blocks double-tap before React re-renders disabled state */
  const checkoutClickLock = useMemo(() => ({ locked: false }), []);

  const location = useLocation();
  const totalNum = cart.reduce((s, i) => s + (parseFloat(i.price) || 0), 0);
  const total = formatMoney(totalNum);
  const hasEnoughBalance = currentBalance >= totalNum;
  const goRecharge = () => navigate('/recharge', { state: { returnTo: location.pathname } });

  const allMethods = useMemo(
    () => buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance: hasEnoughBalance ? currentBalance : 0, isCheckout: true }),
    [t, lang, paymentConfig, hasEnoughBalance, currentBalance],
  );

  const usableMethods = allMethods.filter((m) => !m.disabled && !m.comingSoon);

  useEffect(() => {
    setSelectedMethod(hasEnoughBalance ? 'balance' : 'WalletRecharge');
  }, [hasEnoughBalance]);

  useEffect(() => {
    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(hasEnoughBalance ? 'balance' : 'WalletRecharge');
    }
  }, [allMethods, selectedMethod, usableMethods, hasEnoughBalance]);

  const paymentMethod = activeOrder?.paymentMethod || selectedMethod;
  const isApiWallet = isApiWalletMethod(paymentMethod, paymentConfig);
  const paymentDisplay = getManualPaymentDisplay(paymentConfig, paymentMethod);
  const methodLabel = t[paymentDisplay.methodLabelKey] || paymentMethod;
  const methodReady = isPaymentMethodReady(paymentMethod, paymentConfig);

  const refreshStockCheck = useCallback(async () => {
    if (selectedMethod !== 'balance' || cart.length === 0) {
      setStockCheck({ loading: false, available: true, message: '' });
      return;
    }

    setStockCheck((prev) => ({ ...prev, loading: true }));
    try {
      const result = await inspectFulfillmentAvailability(
        cart.map((item) => ({ offer_id: item.id, quantity: 1 })),
      );
      setStockCheck({
        loading: false,
        available: !!result?.available,
        message: result?.available ? '' : getFulfillmentUnavailableMessage(result, t),
      });
    } catch {
      setStockCheck({
        loading: false,
        available: false,
        message: t.fulfillmentSupplierUnreachable,
      });
    }
  }, [selectedMethod, cart, t]);

  useEffect(() => {
    refreshStockCheck();
  }, [refreshStockCheck]);

  const maintenanceBlocked = isCommerceBlockedDuringMaintenance(siteStatus, user);

  const handleCheckoutProcess = async () => {
    if (isProcessing || checkoutClickLock.locked) return;
    if (maintenanceBlocked) {
      notifyError(t.maintenanceCommerceBlocked);
      return;
    }
    if (!cart?.length) {
      notifyError(t.cartEmptyOrUnavailable || t.emptyCart);
      return;
    }
    checkoutClickLock.locked = true;

    if (selectedMethod === 'WalletRecharge') {
      checkoutClickLock.locked = false;
      goRecharge();
      return;
    }

    if (selectedMethod === 'balance') {
      setIsProcessing(true);
      try {
        const result = await submitOrder(cart, selectedMethod);
        onComplete(result);
      } catch (e) {
        notifyError(`${t.checkoutFailed || 'Checkout failed'}: ${e.message || ''}`);
      } finally {
        setIsProcessing(false);
        checkoutClickLock.locked = false;
      }
      return;
    }

    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      checkoutClickLock.locked = false;
      notifyError(t.paymentMethodUnavailable);
      return;
    }

    if (isManualWalletMethod(selectedMethod) && !methodReady) {
      checkoutClickLock.locked = false;
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
      checkoutClickLock.locked = false;
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
      <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in pb-28 lg:pb-0">
        <BackButton onClick={() => { setStep('method'); setActiveOrder(null); }} t={t} className="mb-4" />

        <div className="card p-4 sm:p-8 md:p-10">
          <div className="mb-6">
            <div className="text-xs font-semibold text-[var(--accent)] mb-1">{methodLabel}</div>
            <h2 className="text-2xl font-black mb-1">{formatMessage(t.completeWalletPayment, { method: methodLabel })}</h2>
            <div className="text-sm text-[var(--text-sec)]">
            {t.orderTotal}: <span className="font-mono font-bold text-[var(--price)]" dir="ltr">{total}</span>
            </div>
          </div>

          {isApiWallet && !activeOrder.invoice ? (
            <AlertBanner tone="amber" centered>
              <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
              <p>{t.samInvoiceUnavailable}</p>
            </AlertBanner>
          ) : isApiWallet && activeOrder.invoice ? (
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
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <div className="text-xs text-[var(--text-muted)]">{t.shamcashPayCodeLabel}</div>
                      <CopyButton value={paymentDisplay.payCode} label={t.copyCode || 'Copy'} copiedLabel={t.copied || 'Copied'} />
                    </div>
                    <div className="font-mono text-lg tracking-wide break-all bg-black/30 rounded-xl px-4 py-3" dir="ltr">
                      {paymentDisplay.payCode}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-center mb-5">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="text-green-400 text-xs uppercase tracking-wider">{t.paymentReference}</div>
                  {activeOrder.reference ? (
                    <CopyButton value={activeOrder.reference} label={t.copyCode || 'Copy'} copiedLabel={t.copied || 'Copied'} />
                  ) : null}
                </div>
                <div className="font-mono text-lg tracking-wider break-all" dir="ltr">{activeOrder.reference || '—'}</div>
              </div>

              {activeOrder.status === 'payment_sent' ? (
                <AlertBanner tone="amber" centered>
                  <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                  <div className="font-bold">{t.awaitingAdminApproval}</div>
                  <p className="text-xs text-[var(--text-sec)] mt-2">{t.orderPendingDesc}</p>
                  <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mt-3" />
                </AlertBanner>
              ) : (
                <>
                  {/* Desktop: inline button. Phones get the sticky bar below so no scrolling is needed. */}
                  <div className="hidden lg:block">
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
                  </div>
                  <MobileBuyBar>
                    <div className="catalog-mobile-buybar" role="region" aria-label={t.confirmPaymentSent}>
                      <div className="catalog-mobile-buybar__inner">
                        <div className="min-w-0 flex-1">
                          <div className="catalog-mobile-buybar__title truncate">{methodLabel}</div>
                          <div className="catalog-mobile-buybar__price tabular-nums" dir="ltr">{total}</div>
                        </div>
                        <button
                          type="button"
                          onClick={confirmPaymentSent}
                          disabled={isProcessing}
                          className="btn btn-primary catalog-mobile-buybar__btn font-bold shrink-0 touch-manipulation inline-flex items-center justify-center gap-2 disabled:opacity-60"
                        >
                          {isProcessing ? (
                            <><Loader2 className="w-4 h-4 animate-spin" /> {t.processing}</>
                          ) : (
                            t.confirmPaymentSent
                          )}
                        </button>
                      </div>
                    </div>
                  </MobileBuyBar>
                </>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  const payDisabled = isProcessing
    || cart.length === 0
    || (selectedMethod === 'balance' && !hasEnoughBalance)
    || (selectedMethod === 'balance' && (stockCheck.loading || !stockCheck.available))
    || (selectedMethod !== 'balance' && !usableMethods.some((m) => m.id === selectedMethod))
    || (isManualWalletMethod(selectedMethod) && !isPaymentMethodReady(selectedMethod, paymentConfig));

  const payLabel = isProcessing
    ? t.processing
    : selectedMethod === 'balance'
      ? t.payFromBalance
      : selectedMethod === 'WalletRecharge'
        ? (t.walletRechargeBtn || (lang === 'ar' ? 'شحن المحفظة للمتابعة' : 'Recharge Wallet to Continue'))
        : t.payNow;

  return (
    <div className="max-w-xl mx-auto mt-4 sm:mt-6 px-2 animate-fade-in pb-28 lg:pb-0">
      <BackButton onClick={() => navigate('/cart')} t={t} ariaLabel={`${t.back} ${t.cart}`} className="mb-4 transition-colors" />
      <div className="card p-4 sm:p-8 md:p-12">
        <div className="mb-5 sm:mb-6">
          <div className="text-xs font-semibold text-[var(--accent)] mb-1">{t.checkout}</div>
          <h2 className="text-2xl sm:text-3xl font-black">{t.paymentMethod}</h2>
          <div className="mt-1 text-xs text-[var(--text-muted)]">
            <span>{t.currentBalance}:</span> <span className="font-mono" dir="ltr">{formatMoney(currentBalance)}</span>
          </div>
        </div>

        {cart.length > 0 && (
          <section className="checkout-summary mb-5 sm:mb-6" aria-label={t.orderSummary}>
            <div className="checkout-summary__title">{t.orderSummary}</div>
            <ul className="checkout-summary__list">
              {cart.map((item, index) => (
                <li key={`${item.id}:${index}`} className="checkout-summary__row">
                  <span className="min-w-0 flex-1 truncate">
                    {brandUserText(getOfferDisplayName(item, lang, { games, relatedOffers: offers }))}
                  </span>
                  <span className="font-mono font-semibold tabular-nums shrink-0" dir="ltr">
                    {formatMoney(item.price)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="checkout-summary__total">
              <span>{t.orderTotal}</span>
              <span className="text-xl font-black text-[var(--price)] tabular-nums" dir="ltr">{total}</span>
            </div>
          </section>
        )}

        <div className="space-y-2.5 sm:space-y-3 mb-6 sm:mb-8" role="radiogroup" aria-label={t.paymentMethod}>
          {allMethods.map((method) => {
            const active = selectedMethod === method.id;
            const isBalance = method.id === 'balance';
            const isDisabled = method.disabled || method.comingSoon;
            const selectable = !isDisabled && !(isBalance && !hasEnoughBalance);
            const choose = () => {
              if (!selectable) return;
              setSelectedMethod(method.id);
            };
            return (
              <div
                key={method.id}
                role="radio"
                aria-checked={active}
                aria-disabled={!selectable}
                tabIndex={selectable ? 0 : -1}
                onClick={choose}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    choose();
                  }
                }}
                className={`pay-method flex items-center p-3.5 sm:p-5 rounded-2xl border ${
                  isDisabled
                    ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                    : `cursor-pointer touch-manipulation ${active ? 'is-active border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/70'} ${isBalance ? 'ring-1 ring-emerald-500/30' : ''}`
                }`}
              >
                <span className={`payment-method-icon-wrap mx-3 sm:mx-4 flex-shrink-0 ${method.color || ''}`}>
                  <PaymentMethodIcon method={method} className="w-8 h-8 sm:w-9 sm:h-9" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-base sm:text-lg flex items-center gap-2 flex-wrap">
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
                  {method.desc && (
                    <div className="text-xs text-[var(--text-sec)] mt-0.5">{method.desc}</div>
                  )}
                  {isBalance && (
                    <div className="text-[10px] text-emerald-400 mt-0.5">{t.balanceUsed}</div>
                  )}
                </div>
                {isBalance && !hasEnoughBalance && (
                  <div className="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 me-2">{t.insufficientBalance}</div>
                )}
                {method.id === 'WalletRecharge' && (
                  <div className="text-xs font-semibold text-[var(--accent)] shrink-0 hidden sm:inline me-2">
                    {t.recharge || (lang === 'ar' ? 'شحن' : 'Recharge')}
                  </div>
                )}
                {selectable && (
                  <span className={`pay-radio${active ? ' is-on' : ''}`} aria-hidden="true">
                    <Check className="w-3 h-3" />
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {!hasEnoughBalance && user && user.role !== 'admin' && (
          <AlertBanner
            tone="amber"
            className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          >
            <p className="text-sm text-amber-100">{t.insufficientBalanceRechargeHint}</p>
            <button
              type="button"
              onClick={goRecharge}
              className="btn btn-primary inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Wallet className="w-4 h-4" />
              {t.recharge}
            </button>
          </AlertBanner>
        )}

        {selectedMethod === 'balance' && !stockCheck.loading && !stockCheck.available && (
          <AlertBanner tone="red" className="mb-6">
            {stockCheck.message || t.fulfillmentOutOfStock}
          </AlertBanner>
        )}

        {/* Desktop: inline button. Phones get the sticky bar below so Pay is always on screen. */}
        <div className="hidden lg:block">
          <button
            onClick={handleCheckoutProcess}
            disabled={payDisabled}
            className="btn btn-primary w-full py-5 text-xl font-black disabled:opacity-60"
          >
            {payLabel}
          </button>
        </div>

        <div className="text-center text-xs text-[var(--text-muted)] mt-4">
          {selectedMethod === 'balance'
            ? t.balanceUsed
            : (isApiWalletMethod(selectedMethod, paymentConfig) ? t.samInvoiceCheckoutNote : t.instantDeliveryNote)}
        </div>
      </div>

      <MobileBuyBar>
        <div className="catalog-mobile-buybar" role="region" aria-label={t.checkout}>
          <div className="catalog-mobile-buybar__inner">
            <div className="min-w-0 flex-1">
              <div className="catalog-mobile-buybar__title truncate">{t.orderTotal}</div>
              <div className="catalog-mobile-buybar__price tabular-nums" dir="ltr">{total}</div>
            </div>
            <button
              type="button"
              onClick={handleCheckoutProcess}
              disabled={payDisabled}
              className="btn btn-primary catalog-mobile-buybar__btn font-bold min-w-0 touch-manipulation inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isProcessing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
              <span className="truncate">{payLabel}</span>
            </button>
          </div>
        </div>
      </MobileBuyBar>
    </div>
  );
}
