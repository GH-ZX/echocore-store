import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle, User, Server, QrCode, Clock, Ticket, Zap } from 'lucide-react';
import { isVoucherGame } from '../lib/catalogUtils';
import { buildPaymentMethods, getDefaultPaymentMethod } from '../lib/paymentMethods';
import { markOrderPaymentSent } from '../lib/orders';
import { resolveOfferRoute } from '../lib/offerRoutes';

export default function BuyView({
  t = {},
  lang,
  navigate,
  user,
  games = [],
  offers = [],
  currentBalance = 0,
  onPurchase,
  paymentConfig = {},
  onNotify,
  loadingCatalog = false,
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');
  const { gameSlug, offerSlug } = useParams();
  const isAr = lang === 'ar';

  const { offer, game } = resolveOfferRoute(offers, games, { gameSlug, offerSlug });

  const availableServers = game && Array.isArray(game.servers) ? game.servers : [];

  const merchantName = paymentConfig.shamcashMerchantName || 'ECHOCORE Store';
  const qrImageUrl = paymentConfig.shamcashQrImageUrl || '';
  const payCode = paymentConfig.shamcashPayCode || '';
  const manualReady = !!paymentConfig.shamcashManualReady && paymentConfig.shamcash !== false;

  const [playerUid, setPlayerUid] = useState('');
  const [playerServer, setPlayerServer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState('details');
  const [activeOrder, setActiveOrder] = useState(null);

  const [redemptionChoice, setRedemptionChoice] = useState('uid');

  const catalogLoading = loadingCatalog || (!offer && offers.length === 0);
  const isValidOffer = !!(offer && game);
  const needsUid = isValidOffer && (game.redemption_method === 'uid' || game.redemption_method === 'both');
  const needsCode = isValidOffer && (game.redemption_method === 'redeem_code' || game.redemption_method === 'both');
  const isBoth = isValidOffer && game.redemption_method === 'both';
  const isVoucherOnly = isValidOffer && isVoucherGame(game);
  const showUidForm = needsUid && (!isBoth || redemptionChoice === 'uid') && !isVoucherOnly;

  const price = offer ? parseFloat(offer.price) : 0;
  const total = price.toFixed(2);
  const hasEnough = currentBalance >= price;

  const paymentMethods = useMemo(
    () => (isValidOffer
      ? buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance: hasEnough ? currentBalance : 0 })
        .filter((m) => m.id === 'balance' || m.id === 'ShamCash')
      : []),
    [t, lang, paymentConfig, hasEnough, currentBalance, isValidOffer],
  );

  const usableMethods = paymentMethods.filter((m) => !m.disabled && !m.comingSoon);

  const [selectedMethod, setSelectedMethod] = useState(() => {
    const methods = buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance });
    return currentBalance >= (offer ? parseFloat(offer.price) : 0) ? 'balance' : getDefaultPaymentMethod(methods);
  });

  useEffect(() => {
    if (!isValidOffer) return;
    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      setSelectedMethod(hasEnough ? 'balance' : getDefaultPaymentMethod(paymentMethods));
    }
  }, [paymentMethods, selectedMethod, usableMethods, hasEnough, isValidOffer]);

  if (catalogLoading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
        <p className="mt-3">{t.loadingOffer || (isAr ? 'جاري تحميل العرض...' : 'Loading offer...')}</p>
      </div>
    );
  }

  if (!isValidOffer) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.offerNotFound || 'Offer not found'}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-4">Back</button>
      </div>
    );
  }

  const currentMethod = paymentMethods.find((m) => m.id === selectedMethod) || usableMethods[0];

  const playerInfo = {
    player_uid: showUidForm ? playerUid.trim() || null : null,
    player_server: playerServer.trim() || null,
  };

  const isUidComplete = !showUidForm || playerUid.trim().length > 2;
  const isServerComplete = availableServers.length === 0 || (playerServer && playerServer.trim().length > 0);
  const canProceed = isUidComplete && isServerComplete && !!currentMethod;
  const isShamCash = selectedMethod === 'ShamCash';

  const startPurchase = async () => {
    if (!user?.id || !canProceed) return;

    if (selectedMethod === 'balance') {
      setIsProcessing(true);
      try {
        const result = await onPurchase(offer, 'balance', playerInfo);
        if (result?.orderId) {
          navigate(`/success?orderId=${result.orderId}`);
        }
      } catch (e) {
        notifyError(`${t.error || 'Error'}: ${e.message || ''}`);
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      notifyError(isAr ? 'طريقة الدفع غير متاحة' : 'Payment method unavailable');
      return;
    }

    if (isShamCash && !manualReady) {
      notifyError(t.rechargeNotConfigured || (isAr ? 'دفع ShamCash غير مُعدّ بعد من الإدارة' : 'ShamCash manual payment is not configured yet'));
      return;
    }

    setIsProcessing(true);
    try {
      const result = await onPurchase(offer, selectedMethod, playerInfo);
      if (result?.orderId) {
        setActiveOrder({
          orderId: result.orderId,
          reference: result.reference,
          total: price,
          status: result.status || 'pending_payment',
        });
        setStep(result.status === 'payment_sent' ? 'pending' : 'payment');
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
      setStep('pending');
      notifySuccess(
        t.orderPendingApproval
          || (isAr ? 'تم استلام طلبك. سيُكتمل الشراء بعد تأكيد الإدارة.' : 'Request received. Your order will complete after admin approval.'),
      );
    } catch (e) {
      notifyError(e.message || t.paymentFailed);
    } finally {
      setIsProcessing(false);
    }
  };

  const name = lang === 'ar' ? offer.name_ar : offer.name_en;
  const regionLabel = game?.region_label || offer?.region || null;
  const gameName = lang === 'ar' ? game.name_ar : game.name_en;
  const purchaseSubtitle = regionLabel ? `${gameName} (${regionLabel}) • ${name}` : `${gameName} • ${name}`;

  if (step === 'payment' || step === 'pending') {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => { setStep('details'); setActiveOrder(null); }}
          className="flex items-center gap-2 mb-6 text-sm text-[var(--text-sec)] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> {t.back || (isAr ? 'رجوع' : 'Back')}
        </button>

        <div className="card p-8">
          <div className="mb-6 text-center">
            <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">ShamCash Pay</div>
            <h1 className="text-2xl font-black">{t.completeShamcashPayment || (isAr ? 'إتمام الدفع عبر ShamCash' : 'Complete ShamCash Payment')}</h1>
            <p className="mt-1 text-[var(--text-sec)]">{purchaseSubtitle}</p>
          </div>

          <div className="text-center mb-6">
            <div className="text-sm text-[var(--text-muted)]">{t.total || 'Total'}</div>
            <div className="text-4xl font-black font-mono text-[var(--accent)]">
              ${activeOrder?.total != null ? parseFloat(activeOrder.total).toFixed(2) : total}
            </div>
            <div className="text-xs text-[var(--text-sec)] mt-1">{merchantName}</div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-center mb-5">
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

          <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-center mb-5">
            <div className="text-green-400 text-xs mb-1 uppercase tracking-wider">
              {t.paymentReference || (isAr ? 'مرجع الدفع' : 'Payment reference')}
            </div>
            <div className="font-mono text-lg tracking-wider">{activeOrder?.reference || '—'}</div>
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
                {t.orderPendingDesc
                  || (isAr ? 'سيُكتمل طلبك بعد أن يتحقق المسؤول من استلام المبلغ في ShamCash.' : 'Your order will complete after an admin verifies the ShamCash payment.')}
              </p>
              <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mt-3" />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 mb-6 text-sm text-[var(--text-sec)] hover:text-white">
        <ArrowLeft className="w-4 h-4" /> {t.back || (isAr ? 'رجوع' : 'Back')}
      </button>

      <div className="card p-8">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">
            {isVoucherOnly
              ? (t.voucherCheckout || (isAr ? 'شراء كود' : 'Voucher checkout'))
              : 'INSTANT PURCHASE'}
          </div>
          <h1 className="text-3xl font-black">
            {isVoucherOnly ? (t.buyVoucher || (isAr ? 'اشترِ الكود' : 'Buy voucher code')) : t.buyInstantly}
          </h1>
          <p className="mt-1 text-[var(--text-sec)]">{purchaseSubtitle}</p>
          {regionLabel && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t.region}: {regionLabel}
            </p>
          )}
        </div>

        <div className="flex justify-between items-baseline mb-6 p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]">
          <div className="text-sm text-[var(--text-muted)]">{t.total || 'Total'}</div>
          <div className="text-4xl font-black text-[var(--accent)]">${total}</div>
        </div>

        {isVoucherOnly ? (
          <div className="mb-8 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-5">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-xl bg-violet-500/15 text-violet-200">
                <Ticket className="w-5 h-5" />
              </div>
              <div>
                <div className="font-semibold text-violet-100 mb-1">
                  {t.voucherDeliveryTitle || (isAr ? 'تسليم فوري للكود' : 'Instant code delivery')}
                </div>
                <p className="text-sm text-[var(--text-sec)] leading-relaxed">
                  {t.voucherDeliveryDesc || (isAr
                    ? 'لا حاجة لـ UID أو سيرفر. بعد الدفع يظهر كود الشحن في إيصال الطلب ويمكنك نسخه فوراً.'
                    : 'No UID or server needed. After payment your redeem code appears on the order receipt — copy it instantly.')}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-2 inline-flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-violet-300" />
                  {t.voucherFulfillmentNote || (isAr ? 'يُوفَّر تلقائياً عبر G2Bulk عند تفعيل التوريد' : 'Auto-fulfilled via G2Bulk when fulfillment is enabled')}
                </p>
              </div>
            </div>
          </div>
        ) : (
        <div className="mb-8">
          <div className="font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            {t.inGameDetails}
          </div>

          {isBoth && (
            <div className="mb-4">
              <div className="text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                {t.chooseRedemptionMethod || (isAr ? 'اختر طريقة الاسترداد' : 'Choose redemption method')}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRedemptionChoice('uid')}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-semibold transition ${redemptionChoice === 'uid' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  {t.useUid || (isAr ? 'استخدم UID' : 'Use UID')}
                </button>
                <button
                  type="button"
                  onClick={() => { setRedemptionChoice('redeem_code'); setPlayerUid(''); setPlayerServer(''); }}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-semibold transition ${redemptionChoice === 'redeem_code' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  {t.useRedeemCode || (isAr ? 'استخدم كود الشحن' : 'Use Redeem Code')}
                </button>
              </div>
            </div>
          )}

          {showUidForm && (
            <div className="mb-3">
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                {isAr ? 'معرف اللاعب (UID)' : 'Player UID / User ID'} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={playerUid}
                onChange={(e) => setPlayerUid(e.target.value)}
                placeholder={t.enterUid}
                className="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 text-lg font-mono focus:border-[var(--accent)] outline-none"
              />
            </div>
          )}

          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center gap-1">
              <Server className="w-3.5 h-3.5" />
              {t.selectServer || (isAr ? 'السيرفر / المنطقة' : 'Server / Region')}
              {availableServers.length > 0 && <span className="text-red-400 ml-1">*</span>}
            </label>

            {availableServers.length > 0 ? (
              <select
                value={playerServer}
                onChange={(e) => setPlayerServer(e.target.value)}
                className="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 focus:border-[var(--accent)] outline-none"
                required
              >
                <option value="">{t.selectServer || '-- Select Server / Region --'}</option>
                {availableServers.map((srv, idx) => (
                  <option key={idx} value={srv}>{srv}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={playerServer}
                onChange={(e) => setPlayerServer(e.target.value)}
                placeholder={t.serverPlaceholder || (isAr ? 'مثال: Europe أو Global' : 'e.g. Europe or Global')}
                className="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 font-mono focus:border-[var(--accent)] outline-none"
              />
            )}
            {availableServers.length > 0 && (
              <p className="text-[10px] text-[var(--text-muted)] mt-1">{t.availableServers} ({availableServers.length})</p>
            )}
            {availableServers.length > 0 && !playerServer && (
              <div className="text-xs text-amber-400 mt-1">{t.serverRequired || 'Please select a server'}</div>
            )}
          </div>

          {(needsCode && !showUidForm) && (
            <div className="text-sm p-3 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 mt-3 mb-2">
              {t.redeemCodeWillBeProvided || (isAr
                ? 'ستحصل على كود شحن بعد الشراء. استخدمه داخل اللعبة.'
                : 'You will receive a redeem code after purchase. Use it in-game.')}
            </div>
          )}

          {isBoth && showUidForm && (
            <div className="text-xs text-[var(--text-muted)] mb-2 mt-2">
              {isAr ? 'اخترت الشحن عبر UID. سيتم إرسال النقاط إلى حسابك.' : 'You chose UID top-up. Points will be sent to the provided UID.'}
            </div>
          )}

          {!isUidComplete && needsUid && (
            <div className="text-xs text-amber-400 mb-2 mt-2">* {isAr ? 'الرجاء إدخال UID صحيح' : 'Please enter a valid UID'}</div>
          )}
        </div>
        )}

        {!manualReady && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t.rechargeNotConfigured || (isAr ? 'دفع ShamCash اليدوي غير جاهز. يمكنك الدفع من الرصيد أو التواصل مع الدعم.' : 'Manual ShamCash payment is not ready. Pay from balance or contact support.')}
          </div>
        )}

        <div className="mb-6">
          <div className="font-semibold mb-3 text-sm text-[var(--text-sec)]">{t.paymentMethod}</div>
          <div className="space-y-2">
            {paymentMethods.map((m) => {
              const Icon = m.icon;
              const active = selectedMethod === m.id;
              const isDisabled = m.disabled || m.comingSoon;
              return (
                <div
                  key={m.id}
                  onClick={() => !isDisabled && setSelectedMethod(m.id)}
                  className={`flex items-center p-4 rounded-2xl border transition ${
                    isDisabled
                      ? 'border-[var(--border)] opacity-50 cursor-not-allowed'
                      : `cursor-pointer ${active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/50'}`
                  }`}
                >
                  <Icon className={`w-7 h-7 ${m.color} mr-4 flex-shrink-0`} />
                  <div className="min-w-0">
                    <div className="font-bold flex items-center gap-2">
                      {m.name}
                      {m.id === 'ShamCash' && (
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">
                          {t.shamcashManualOnly || (isAr ? 'يدوي — موافقة الإدارة' : 'Manual — admin approval')}
                        </span>
                      )}
                    </div>
                  </div>
                  {m.id === 'balance' && <div className="ml-auto text-xs text-emerald-400">(${currentBalance.toFixed(2)})</div>}
                </div>
              );
            })}
          </div>
        </div>

        <button
          type="button"
          onClick={startPurchase}
          disabled={!canProceed || isProcessing || !user || (isShamCash && !manualReady)}
          className="btn btn-primary w-full py-5 text-xl font-black disabled:opacity-50"
        >
          {isProcessing ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="animate-spin w-5 h-5" /> {t.processing}
            </span>
          ) : (
            `${t.buyNow} • $${total}`
          )}
        </button>

        {isShamCash && (
          <div className="text-center text-[10px] mt-4 text-[var(--text-muted)]">
            {t.orderManualNote || (isAr ? 'لا يُكتمل الطلب تلقائياً. تُراجع كل دفعة ShamCash يدوياً من الإدارة.' : 'Orders are not completed automatically. Every ShamCash payment is reviewed manually.')}
          </div>
        )}
        {!isShamCash && (
          <div className="text-center text-[10px] mt-4 text-[var(--text-muted)]">
            {t.instantDeliveryNote}
          </div>
        )}
      </div>
    </div>
  );
}