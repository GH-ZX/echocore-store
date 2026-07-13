import { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, Loader2, CheckCircle, User, QrCode, Clock, Ticket, Zap, Gift, Wallet } from 'lucide-react';
import ServerIdField from '../components/catalog/ServerIdField';
import { isVoucherGame } from '../lib/catalogUtils';
import {
  buildPaymentMethods,
  getDefaultPaymentMethod,
  getManualPaymentDisplay,
  isManualWalletMethod,
  isApiWalletMethod,
  isPaymentMethodReady,
  hasAnyManualWalletReady,
} from '../lib/paymentMethods';
import SamInvoicePaymentPanel from '../components/SamInvoicePaymentPanel';
import { formatMessage } from '../lib/i18n';
import { markOrderPaymentSent } from '../lib/orders';
import { getOfferDisplayName } from '../lib/offerDisplay';
import { resolveOfferRoute } from '../lib/offerRoutes';
import { brandUserText } from '../lib/branding';
import { getSavedGamePlayerEntry } from '../lib/gamePlayerUid';
import { getAdminGiftPath } from '../lib/adminRoutes';
import { getGameOfferPath } from '../lib/offerRoutes';
import { g2bulkCheckPlayer } from '../lib/g2bulk';
import {
  getFulfillmentUnavailableMessage,
  inspectFulfillmentAvailability,
} from '../lib/fulfillmentAvailability';
import {
  gameShowsServerField,
  resolvePlayerServerForOrder,
} from '../lib/gameServers';

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
  onOrderPaid,
  loadingCatalog = false,
}) {
  const notifyError = (message) => onNotify?.(message, 'error');
  const notifySuccess = (message) => onNotify?.(message, 'success');
  const { gameSlug, offerSlug } = useParams();
  const location = useLocation();

  const { offer, game } = resolveOfferRoute(offers, games, { gameSlug, offerSlug });

  const anyManualReady = hasAnyManualWalletReady(paymentConfig);

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
  const showRecipientFields = showUidForm && !isVoucherOnly;
  const needsServerField = showRecipientFields && gameShowsServerField(game);

  const price = offer ? parseFloat(offer.price) : 0;
  const total = price.toFixed(2);
  const hasEnough = currentBalance >= price;
  const goRecharge = () => navigate('/recharge', { state: { returnTo: location.pathname } });

  const paymentMethods = useMemo(
    () => (isValidOffer
      ? buildPaymentMethods(t, lang, paymentConfig, { includeBalance: true, currentBalance: hasEnough ? currentBalance : 0 })
        .filter((m) => m.id === 'balance' || m.id === 'ShamCash' || m.id === 'SyriatelCash')
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

  const savedGamePlayer = isValidOffer && showUidForm && game
    ? getSavedGamePlayerEntry(user?.game_player_uids, game)
    : { uid: '', server: '' };

  useEffect(() => {
    if (!isValidOffer || !showUidForm || !game) return;
    const saved = getSavedGamePlayerEntry(user?.game_player_uids, game);
    if (saved.uid) {
      setPlayerUid((prev) => prev.trim() || saved.uid);
    }
    if (saved.server) {
      setPlayerServer((prev) => prev.trim() || saved.server);
    }
  }, [isValidOffer, showUidForm, game, user?.game_player_uids]);

  const isUidCompleteForStock = !showUidForm || playerUid.trim().length > 2;
  const [stockCheck, setStockCheck] = useState({ loading: false, available: true, message: '' });

  useEffect(() => {
    if (!isValidOffer || selectedMethod !== 'balance' || !offer?.id || !isUidCompleteForStock) {
      setStockCheck({ loading: false, available: true, message: '' });
      return undefined;
    }

    let cancelled = false;
    setStockCheck((prev) => ({ ...prev, loading: true }));

    inspectFulfillmentAvailability([{
      offer_id: offer.id,
      quantity: 1,
      player_uid: showUidForm ? playerUid.trim() || null : null,
    }])
      .then((result) => {
        if (cancelled) return;
        setStockCheck({
          loading: false,
          available: !!result?.available,
          message: result?.available ? '' : getFulfillmentUnavailableMessage(result, t),
        });
      })
      .catch(() => {
        if (cancelled) return;
        setStockCheck({
          loading: false,
          available: false,
          message: t.fulfillmentSupplierUnreachable,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [
    isValidOffer,
    selectedMethod,
    offer?.id,
    playerUid,
    showUidForm,
    isUidCompleteForStock,
    t,
  ]);

  if (catalogLoading) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center text-[var(--text-sec)]">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-[var(--accent)]" />
        <p className="mt-3">{t.loadingOffer}</p>
      </div>
    );
  }

  if (!isValidOffer) {
    return (
      <div className="max-w-md mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.offerNotFound}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.back}</button>
      </div>
    );
  }

  if (user?.role === 'admin') {
    const gamePath = `/game/${game.slug || game.id}`;
    const giftPath = getAdminGiftPath({
      offerId: offer.id,
      returnTo: getGameOfferPath(offer, games),
    });
    return (
      <div className="max-w-xl mx-auto mt-6 px-2 animate-fade-in">
        <button
          type="button"
          onClick={() => navigate(gamePath)}
          className="flex items-center gap-2 mb-4 text-sm text-[var(--text-sec)] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </button>
        <div className="card p-8 text-center border border-pink-500/20 bg-pink-500/5">
          <Gift className="w-12 h-12 mx-auto text-pink-300 mb-4" />
          <h1 className="text-2xl font-black mb-2">{t.adminCannotPurchaseTitle}</h1>
          <p className="text-sm text-[var(--text-sec)] leading-relaxed max-w-md mx-auto">
            {t.adminCannotPurchaseDesc}
          </p>
          <button type="button" onClick={() => navigate(giftPath)} className="btn btn-primary mt-6">
            {t.giftOffer}
          </button>
        </div>
      </div>
    );
  }

  const currentMethod = paymentMethods.find((m) => m.id === selectedMethod) || usableMethods[0];

  const resolvedPlayerServer = needsServerField
    ? resolvePlayerServerForOrder(game, playerServer)
    : null;

  const playerInfo = {
    player_uid: showUidForm ? playerUid.trim() || null : null,
    player_server: resolvedPlayerServer,
  };

  const isUidComplete = !showUidForm || playerUid.trim().length > 2;
  const isServerComplete = !needsServerField || !!resolvedPlayerServer;
  const canProceed = isUidComplete && isServerComplete && !!currentMethod;
  const isManualWallet = isManualWalletMethod(selectedMethod);
  const isApiWallet = isApiWalletMethod(selectedMethod, paymentConfig);
  const methodReady = isPaymentMethodReady(selectedMethod, paymentConfig);
  const startPurchase = async () => {
    if (!user?.id || !canProceed) return;

    if (showRecipientFields && playerUid.trim()) {
      try {
        const validation = await g2bulkCheckPlayer({
          game: game?.g2bulk_game_code || game?.slug || game?.id || '',
          userId: playerUid.trim(),
          serverId: resolvedPlayerServer || undefined,
        });
        const isValidationValid = validation?.valid === 'valid' || validation?.valid === true || validation?.valid === 'true' || validation?.success !== false;
        if (!isValidationValid) {
          const validationMessage = validation?.message || validation?.error || t.playerValidationFailed || t.validationFailed || 'We could not validate this account for the selected game.';
          notifyError(brandUserText(validationMessage));
          return;
        }
      } catch (_e) {
        notifyError(brandUserText(t.playerValidationFailed || t.validationFailed || 'We could not validate this account for the selected game right now.'));
        return;
      }
    }

    if (selectedMethod === 'balance') {
      setIsProcessing(true);
      try {
        const result = await onPurchase(offer, 'balance', playerInfo);
        if (result?.orderId) {
          navigate(`/success?orderId=${result.orderId}`);
        }
      } catch (e) {
        notifyError(brandUserText(`${t.error}: ${e.message || ''}`));
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    if (!usableMethods.some((m) => m.id === selectedMethod)) {
      notifyError(t.paymentMethodUnavailable);
      return;
    }

    if (isManualWallet && !methodReady) {
      notifyError(t.walletBuyNotConfigured);
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
          invoice: result.invoice || null,
          paymentMethod: selectedMethod,
        });
        setStep(result.status === 'payment_sent' ? 'pending' : 'payment');
      }
    } catch (e) {
      notifyError(brandUserText(`${t.paymentFailed}: ${e.message || ''}`));
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
      notifySuccess(t.orderPendingApproval);
    } catch (e) {
      notifyError(brandUserText(e.message || t.paymentFailed));
    } finally {
      setIsProcessing(false);
    }
  };

  const name = getOfferDisplayName(offer, lang, { game, games, relatedOffers: offers });
  const regionLabel = game?.region_label || offer?.region || null;
  const gameName = brandUserText(lang === 'ar' ? game.name_ar : game.name_en);
  const purchaseSubtitle = regionLabel ? `${gameName} (${regionLabel}) • ${name}` : `${gameName} • ${name}`;

  const activePaymentMethod = activeOrder?.paymentMethod || selectedMethod;
  const activeIsApiWallet = isApiWalletMethod(activePaymentMethod, paymentConfig);
  const activePaymentDisplay = getManualPaymentDisplay(paymentConfig, activePaymentMethod);
  const activeMethodLabel = t[activePaymentDisplay.methodLabelKey] || activePaymentMethod;

  const handleInvoicePaid = async () => {
    const orderId = activeOrder?.orderId;
    if (!orderId) return;
    try {
      await onOrderPaid?.(orderId);
    } catch {
      /* fulfillment errors surfaced elsewhere */
    }
    navigate(`/success?orderId=${orderId}`);
  };

  if (step === 'payment' || step === 'pending') {
    return (
      <div className="max-w-2xl mx-auto">
        <button
          type="button"
          onClick={() => { setStep('details'); setActiveOrder(null); }}
          className="flex items-center gap-2 mb-6 text-sm text-[var(--text-sec)] hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" /> {t.back}
        </button>

        <div className="card p-8">
          <div className="mb-6 text-center">
            <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">{activeMethodLabel}</div>
            <h1 className="text-2xl font-black">{formatMessage(t.completeWalletPayment, { method: activeMethodLabel })}</h1>
            <p className="mt-1 text-[var(--text-sec)]">{purchaseSubtitle}</p>
          </div>

          <div className="text-center mb-6">
            <div className="text-sm text-[var(--text-muted)]">{t.total}</div>
            <div className="text-4xl font-black font-mono text-[var(--accent)]">
              ${activeOrder?.total != null ? parseFloat(activeOrder.total).toFixed(2) : total}
            </div>
            {!activeIsApiWallet && (
              <div className="text-xs text-[var(--text-sec)] mt-1">{activePaymentDisplay.merchantName}</div>
            )}
          </div>

          {activeIsApiWallet && activeOrder?.invoice ? (
            <SamInvoicePaymentPanel
              t={t}
              lang={lang}
              total={activeOrder.total}
              methodLabel={activeMethodLabel}
              invoice={activeOrder.invoice}
              onPaid={handleInvoicePaid}
              onExpired={() => { setStep('details'); setActiveOrder(null); }}
              onNotify={onNotify}
            />
          ) : (
            <>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] p-5 text-center mb-5">
                <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-semibold mb-4">
                  <QrCode className="w-4 h-4" />
                  {activeMethodLabel}
                </div>

                {activePaymentDisplay.qrImageUrl ? (
                  <img
                    src={activePaymentDisplay.qrImageUrl}
                    alt=""
                    className="mx-auto max-w-[220px] w-full rounded-xl border border-[var(--border)] bg-white p-2"
                  />
                ) : (
                  <div className="py-10 text-sm text-[var(--text-muted)]">{t.qrNotConfigured}</div>
                )}

                {activePaymentDisplay.payCode && (
                  <div className="mt-4">
                    <div className="text-xs text-[var(--text-muted)] mb-1">
                      {t.shamcashPayCodeLabel}
                    </div>
                    <div className="font-mono text-lg tracking-wide break-all text-[var(--text-primary)] bg-black/30 rounded-xl px-4 py-3">
                      {activePaymentDisplay.payCode}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-black/40 p-4 text-center mb-5">
                <div className="text-green-400 text-xs mb-1 uppercase tracking-wider">
                  {t.paymentReference}
                </div>
                <div className="font-mono text-lg tracking-wider">{activeOrder?.reference || '—'}</div>
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
                    {t.orderPendingDesc}
                  </p>
                  <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mt-3" />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 mb-6 text-sm text-[var(--text-sec)] hover:text-white">
        <ArrowLeft className="w-4 h-4" /> {t.back}
      </button>

      <div className="card p-8">
        <div className="mb-8 text-center">
          <div className="text-xs uppercase tracking-widest text-[var(--text-muted)] mb-1">
            {isVoucherOnly ? t.voucherCheckout : t.instantPurchaseLabel}
          </div>
          <h1 className="text-3xl font-black">
            {isVoucherOnly ? t.buyVoucher : t.buyInstantly}
          </h1>
          <p className="mt-1 text-[var(--text-sec)]">{purchaseSubtitle}</p>
          {regionLabel && (
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {t.region}: {regionLabel}
            </p>
          )}
        </div>

        <div className="flex justify-between items-baseline mb-6 p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]">
          <div className="text-sm text-[var(--text-muted)]">{t.total}</div>
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
                  {t.voucherDeliveryTitle}
                </div>
                <p className="text-sm text-[var(--text-sec)] leading-relaxed">
                  {t.voucherDeliveryDesc}
                </p>
                <p className="text-xs text-[var(--text-muted)] mt-2 inline-flex items-center gap-1">
                  <Zap className="w-3.5 h-3.5 text-violet-300" />
                  {t.voucherFulfillmentNote}
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
                {t.chooseRedemptionMethod}
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setRedemptionChoice('uid')}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-semibold transition ${redemptionChoice === 'uid' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  {t.useUid}
                </button>
                <button
                  type="button"
                  onClick={() => { setRedemptionChoice('redeem_code'); setPlayerUid(''); setPlayerServer(''); }}
                  className={`flex-1 py-3 rounded-2xl border text-sm font-semibold transition ${redemptionChoice === 'redeem_code' ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] hover:border-[var(--accent)]/60'}`}
                >
                  {t.useRedeemCode}
                </button>
              </div>
            </div>
          )}

          {showUidForm && (
            <div className="mb-3">
              <label className="text-xs text-[var(--text-muted)] block mb-1">
                {t.playerUidLabel} <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={playerUid}
                onChange={(e) => setPlayerUid(e.target.value)}
                placeholder={t.enterUid}
                className="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 text-lg font-mono focus:border-[var(--accent)] outline-none"
              />
              {savedGamePlayer.uid && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.gameUidAutofillHint}</p>
              )}
            </div>
          )}

          {needsServerField && (
            <ServerIdField
              game={game}
              value={playerServer}
              onChange={setPlayerServer}
              t={t}
              required
              inputClassName="w-full rounded-2xl bg-[var(--bg-surface)] border border-[var(--border)] px-4 py-3 font-mono focus:border-[var(--accent)] outline-none"
            />
          )}

          {(needsCode && !showUidForm) && (
            <div className="text-sm p-3 rounded-xl bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 mt-3 mb-2">
              {t.redeemCodeInGameNote}
            </div>
          )}

          {isBoth && showUidForm && (
            <div className="text-xs text-[var(--text-muted)] mb-2 mt-2">
              {t.uidTopUpChosen}
            </div>
          )}

          {!isUidComplete && needsUid && (
            <div className="text-xs text-amber-400 mb-2 mt-2">* {t.validUidRequired}</div>
          )}
        </div>
        )}

        {!anyManualReady && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            {t.walletManualNotReady}
          </div>
        )}

        <div className="mb-6">
          <div className="font-semibold mb-3 text-sm text-[var(--text-sec)]">{t.paymentMethod}</div>
          <div className="space-y-2">
            {paymentMethods.map((m) => {
              const Icon = m.icon;
              const active = selectedMethod === m.id;
              const isBalance = m.id === 'balance';
              const isDisabled = m.disabled || m.comingSoon || (isBalance && !hasEnough);
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
                      {isManualWalletMethod(m.id) && m.manualOnlyKey && (
                        <span className="text-[10px] text-[var(--text-muted)] font-normal">
                          {t[m.manualOnlyKey]}
                        </span>
                      )}
                    </div>
                  </div>
                  {isBalance && (
                    <div className="ml-auto flex flex-col items-end gap-1">
                      <div className="text-xs text-emerald-400">(${currentBalance.toFixed(2)})</div>
                      {!hasEnough && (
                        <div className="text-[10px] px-2 py-0.5 rounded bg-red-500/10 text-red-400">
                          {t.insufficientBalance}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {!hasEnough && user && user.role !== 'admin' && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <p className="text-sm text-amber-100">{t.insufficientBalanceRechargeHint}</p>
            <button
              type="button"
              onClick={goRecharge}
              className="btn btn-primary inline-flex items-center justify-center gap-2 shrink-0"
            >
              <Wallet className="w-4 h-4" />
              {t.recharge}
            </button>
          </div>
        )}

        {selectedMethod === 'balance' && !stockCheck.loading && !stockCheck.available && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            {stockCheck.message || t.fulfillmentOutOfStock}
          </div>
        )}

        <button
          type="button"
          onClick={startPurchase}
          disabled={
            !canProceed
            || isProcessing
            || !user
            || (selectedMethod === 'balance' && !hasEnough)
            || (selectedMethod === 'balance' && (stockCheck.loading || !stockCheck.available))
            || (isManualWallet && !methodReady)
          }
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

        {isManualWallet && !isApiWallet && (
          <div className="text-center text-[10px] mt-4 text-[var(--text-muted)]">
            {t.orderManualNote}
          </div>
        )}
        {isApiWallet && (
          <div className="text-center text-[10px] mt-4 text-[var(--text-muted)]">
            {t.samInvoiceCheckoutNote}
          </div>
        )}
        {!isManualWallet && (
          <div className="text-center text-[10px] mt-4 text-[var(--text-muted)]">
            {t.instantDeliveryNote}
          </div>
        )}
      </div>
    </div>
  );
}