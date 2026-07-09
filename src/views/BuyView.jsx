import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle, User, Server } from 'lucide-react';
import { buildPaymentMethods, getDefaultPaymentMethod } from '../lib/paymentMethods';

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
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const { offerId } = useParams();

  const offer = offers.find(o => String(o.id) === String(offerId));
  const game = offer ? games.find(g => g.id === offer.game_id) : null;

  const availableServers = (game && Array.isArray(game.servers)) ? game.servers : [];

  const [playerUid, setPlayerUid] = useState('');
  const [playerServer, setPlayerServer] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimModal, setShowSimModal] = useState(false);
  const [simRef, setSimRef] = useState('');
  const [pendingShamRef, setPendingShamRef] = useState('');
  const merchantName = paymentConfig.shamcashMerchantName || 'ECHOCORE Store';

  // For games with 'both' redemption, user must choose one
  const [redemptionChoice, setRedemptionChoice] = useState('uid');

  const isValidOffer = !!(offer && game);
  const needsUid = isValidOffer && (game.redemption_method === 'uid' || game.redemption_method === 'both');
  const needsCode = isValidOffer && (game.redemption_method === 'redeem_code' || game.redemption_method === 'both');
  const isBoth = isValidOffer && game.redemption_method === 'both';
  const showUidForm = needsUid && (!isBoth || redemptionChoice === 'uid');

  const price = offer ? parseFloat(offer.price) : 0;
  const total = price.toFixed(2);
  const hasEnough = currentBalance >= price;

  const paymentMethods = useMemo(
    () => (isValidOffer
      ? buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance: hasEnough ? currentBalance : 0 })
      : []),
    [t, lang, paymentConfig, hasEnough, currentBalance, isValidOffer]
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

  if (!isValidOffer) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.offerNotFound || 'Offer not found'}</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">Back</button>
      </div>
    );
  }

  const currentMethod = paymentMethods.find((m) => m.id === selectedMethod) || usableMethods[0];

  const playerInfo = {
    player_uid: showUidForm ? playerUid.trim() || null : null,
    player_server: playerServer.trim() || null,
  };

  const isUidComplete = !showUidForm || (playerUid.trim().length > 2);
  const isServerComplete = availableServers.length === 0 || (playerServer && playerServer.trim().length > 0);
  const canProceed = isUidComplete && isServerComplete && !!currentMethod;

  // Simulate payment like in recharge
  const simulatePayment = async () => {
    await new Promise((r) => setTimeout(r, 1200));
    return { success: true, reference: `ECHOCORE-${Date.now().toString(36).toUpperCase()}` };
  };

  const startPurchase = async () => {
    if (!user?.id || !canProceed) return;

    if (selectedMethod === 'balance') {
      // Direct balance path
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
      notifyError(lang === 'ar' ? 'طريقة الدفع غير متاحة' : 'Payment method unavailable');
      return;
    }

    setPendingShamRef(`ECHOCORE-${Date.now().toString().slice(-8)}`);
    setShowSimModal(true);
    setSimRef('');
  };

  const confirmExternalPayment = async () => {
    setIsProcessing(true);
    try {
      const sim = await simulatePayment();

      const result = await onPurchase(offer, selectedMethod, playerInfo, {
        paymentReference: sim.reference,
      });

      setSimRef(sim.reference);

      setTimeout(() => {
        setShowSimModal(false);
        setIsProcessing(false);
        if (result?.orderId) {
          navigate(`/success?orderId=${result.orderId}`);
        }
      }, 850);
    } catch (e) {
      notifyError(`${t.paymentFailed || 'Payment failed'}: ${e.message || ''}`);
      setIsProcessing(false);
      setShowSimModal(false);
    }
  };

  const name = lang === 'ar' ? offer.name_ar : offer.name_en;
  const gameName = lang === 'ar' ? game.name_ar : game.name_en;

  return (
    <div className="max-w-2xl mx-auto">
      <button onClick={() => navigate(-1)} className="flex items-center gap-2 mb-6 text-sm text-[var(--text-sec)] hover:text-white">
        <ArrowLeft className="w-4 h-4" /> {t.back || (lang === 'ar' ? 'رجوع' : 'Back')}
      </button>

      <div className="card p-8">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">INSTANT PURCHASE</div>
          <h1 className="text-3xl font-black">{t.buyInstantly}</h1>
          <p className="mt-1 text-[var(--text-sec)]">{gameName} • {name}</p>
        </div>

        {/* Price */}
        <div className="flex justify-between items-baseline mb-6 p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]">
          <div className="text-sm text-[var(--text-muted)]">{t.total || 'Total'}</div>
          <div className="text-4xl font-black text-[var(--accent)]">${total}</div>
        </div>

        {/* In-Game Details Form - Server selector always shown */}
        <div className="mb-8">
          <div className="font-semibold mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            {t.inGameDetails}
          </div>

          {/* Choice for 'both' redemption_method */}
          {isBoth && (
            <div className="mb-4">
              <div className="text-xs text-[var(--text-muted)] mb-1.5 font-medium">
                {t.chooseRedemptionMethod || (lang === 'ar' ? 'اختر طريقة الاسترداد' : 'Choose redemption method')}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRedemptionChoice('uid')}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-semibold transition ${redemptionChoice === 'uid' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  {t.useUid || (lang === 'ar' ? 'استخدم UID' : 'Use UID')}
                </button>
                <button
                  type="button"
                  onClick={() => { setRedemptionChoice('redeem_code'); setPlayerUid(''); setPlayerServer(''); }}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-semibold transition ${redemptionChoice === 'redeem_code' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  {t.useRedeemCode || (lang === 'ar' ? 'استخدم كود الشحن' : 'Use Redeem Code')}
                </button>
              </div>
            </div>
          )}

          {/* UID input - only for uid or both+uid */}
          {showUidForm && (
            <div className="mb-3">
              <div>
                <label className="text-xs text-[var(--text-muted)] block mb-1">
                  {lang === 'ar' ? 'معرف اللاعب (UID)' : 'Player UID / User ID'} <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={playerUid}
                  onChange={e => setPlayerUid(e.target.value)}
                  placeholder={t.enterUid}
                  className="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 text-lg font-mono focus:border-[var(--accent)] outline-none"
                />
              </div>
            </div>
          )}

          {/* Server / Region selector - ALWAYS shown for any game */}
          <div>
            <label className="text-xs text-[var(--text-muted)] block mb-1 flex items-center gap-1">
              <Server className="w-3.5 h-3.5" />
              {t.selectServer || (lang === 'ar' ? 'السيرفر / المنطقة' : 'Server / Region')}
              {availableServers.length > 0 && <span className="text-red-400 ml-1">*</span>}
            </label>

            {availableServers.length > 0 ? (
              <select
                value={playerServer}
                onChange={e => setPlayerServer(e.target.value)}
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
                onChange={e => setPlayerServer(e.target.value)}
                placeholder={t.serverPlaceholder || (lang === 'ar' ? 'مثال: Europe أو Global' : 'e.g. Europe or Global')}
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

          {/* Note when redeem code is chosen (for pure redeem or both) */}
          {(needsCode && !showUidForm) && (
            <div className="text-sm p-3 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 mb-2">
              {t.redeemCodeWillBeProvided || (lang === 'ar' 
                ? 'ستحصل على كود شحن بعد الشراء. استخدمه داخل اللعبة.' 
                : 'You will receive a redeem code after purchase. Use it in-game.')}
            </div>
          )}

          {/* Info for both - only when uid chosen */}
          {isBoth && showUidForm && (
            <div className="text-xs text-[var(--text-muted)] mb-2">
              {lang === 'ar' ? 'اخترت الشحن عبر UID. سيتم إرسال النقاط إلى حسابك.' : 'You chose UID top-up. Points will be sent to the provided UID.'}
            </div>
          )}

          {!isUidComplete && needsUid && (
            <div className="text-xs text-amber-400 mb-2">* {lang === 'ar' ? 'الرجاء إدخال UID صحيح' : 'Please enter a valid UID'}</div>
          )}
        </div>

        {/* Payment Methods */}
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
                  <div className="font-bold flex items-center gap-2 min-w-0">
                    {m.name}
                    {m.comingSoon && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] text-[var(--text-muted)]">
                        {t.comingSoon || (lang === 'ar' ? 'قريباً' : 'Coming soon')}
                      </span>
                    )}
                  </div>
                  {m.id === 'balance' && <div className="ml-auto text-xs text-emerald-400">(${currentBalance.toFixed(2)})</div>}
                </div>
              );
            })}
          </div>
        </div>

        <button
          onClick={startPurchase}
          disabled={!canProceed || isProcessing || !user}
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

        <div className="text-center text-[10px] mt-4 text-[var(--text-muted)]">
          {t.instantDeliveryNote}
        </div>
      </div>

      {/* Simulation Modal (for external payment methods) */}
      {showSimModal && selectedMethod === 'ShamCash' && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[80] p-4" onClick={() => !isProcessing && setShowSimModal(false)}>
          <div className="card max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-center font-bold text-xl mb-4">
              {lang === 'ar' ? 'إتمام الدفع عبر ShamCash' : 'Complete ShamCash Payment'}
            </h3>

            <div className="mb-4 text-center text-sm text-[var(--text-sec)]">
              ${total} → {merchantName}
            </div>

            <div className="p-4 bg-black/70 rounded-xl mb-5 text-center">
              <div className="text-green-400 mb-1 text-sm">SHAMCASH REFERENCE</div>
              <div className="font-mono text-2xl tracking-widest">{pendingShamRef || simRef}</div>
              <p className="text-xs mt-2 text-[var(--text-muted)]">
                {lang === 'ar' ? 'ادفع عبر تطبيق ShamCash ثم أكّد' : 'Pay in ShamCash app, then confirm'}
              </p>
            </div>

            {!simRef ? (
              <button 
                onClick={confirmExternalPayment} 
                disabled={isProcessing}
                className="btn btn-primary w-full py-4 font-bold flex justify-center gap-2"
              >
                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {lang === 'ar' ? 'تأكيد الدفع وإكمال الشراء' : 'Confirm Payment & Complete Purchase'}
              </button>
            ) : (
              <div className="text-center py-2">
                <CheckCircle className="mx-auto w-9 h-9 text-emerald-400 mb-2" />
                <div className="font-bold text-lg">{lang === 'ar' ? 'تم الدفع بنجاح!' : 'Payment successful!'}</div>
              </div>
            )}

            {!isProcessing && (
              <button onClick={() => setShowSimModal(false)} className="mt-3 w-full text-sm text-[var(--text-sec)]">
                {t.cancel || 'Cancel'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
