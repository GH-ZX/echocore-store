import { useState, useEffect, useMemo } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import { Loader2, CheckCircle, User, QrCode, Clock, Ticket, Zap, Gift, Wallet, Info } from 'lucide-react';
import AlertBanner from '../components/ui/AlertBanner';
import EmptyState from '../components/ui/EmptyState';
import CharnameField from '../components/catalog/CharnameField';
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
import PaymentMethodIcon from '../components/ui/PaymentMethodIcon';
import { formatMessage, formatMoney } from '../lib/i18n';
import { renderRichTextLinks } from '../lib/richText';
import { markOrderPaymentSent } from '../lib/orders';
import { getOfferDisplayName, getOfferHowTo } from '../lib/offerDisplay';
import { resolveOfferRoute } from '../lib/offerRoutes';
import { brandUserText } from '../lib/branding';
import { getSavedGamePlayerEntry } from '../lib/gamePlayerUid';
import { getAdminGiftPath } from '../lib/adminRoutes';
import { getGameOfferPath } from '../lib/offerRoutes';
import { g2bulkCheckPlayer, g2bulkGetTopupMeta } from '../lib/g2bulk';
import {
  getFulfillmentUnavailableMessage,
  inspectFulfillmentAvailability,
} from '../lib/fulfillmentAvailability';
import { markOrderFulfillAllowed } from '../lib/orderAccess';
import {
  buildTopupMetaFlags,
  buildTopupMetaFromGame,
  gameShowsCharnameField,
  isCharnameComplete,
} from '../lib/gameTopupFields';
import {
  gameShowsServerField,
  resolvePlayerServerForOrder,
} from '../lib/gameServers';
import {
  couponErrorMessage,
  validateInfluencerCoupon,
} from '../lib/coupons';
import { resolveCustomerUnitPrice } from '../lib/partnerPricing';
import { fetchMyOfferUnitPrices } from '../lib/offerWholesale';
import { useNotify } from '../hooks/useNotify';
import BackButton from '../components/ui/BackButton';

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
  partnerTier = null,
}) {
  const { notifyError, notifySuccess } = useNotify(onNotify);
  const { gameSlug, offerSlug } = useParams();
  const location = useLocation();

  const { offer, game } = resolveOfferRoute(offers, games, { gameSlug, offerSlug });

  const anyManualReady = hasAnyManualWalletReady(paymentConfig);

  const [playerUid, setPlayerUid] = useState('');
  const [playerServer, setPlayerServer] = useState('');
  const [playerCharname, setPlayerCharname] = useState('');
  const [topupMeta, setTopupMeta] = useState(() => buildTopupMetaFromGame(null));
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState('details');
  const [activeOrder, setActiveOrder] = useState(null);

  const [redemptionChoice, setRedemptionChoice] = useState('uid');
  const [couponInput, setCouponInput] = useState('');
  const [couponApplying, setCouponApplying] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState(null);
  const [couponError, setCouponError] = useState('');
  const [couponOkMsg, setCouponOkMsg] = useState('');

  const catalogLoading = loadingCatalog || (!offer && offers.length === 0);
  const isValidOffer = !!(offer && game);
  const needsUid = isValidOffer && (game.redemption_method === 'uid' || game.redemption_method === 'both');
  const needsCode = isValidOffer && (game.redemption_method === 'redeem_code' || game.redemption_method === 'both');
  const isBoth = isValidOffer && game.redemption_method === 'both';
  const isVoucherOnly = isValidOffer && isVoucherGame(game);
  const showUidForm = needsUid && (!isBoth || redemptionChoice === 'uid') && !isVoucherOnly;
  const showRecipientFields = showUidForm && !isVoucherOnly;
  const needsServerField = showRecipientFields && gameShowsServerField(game, topupMeta);
  const needsCharnameField = showRecipientFields && gameShowsCharnameField(game, topupMeta);

  const partnerMarkup = partnerTier?.markupPercent != null
    ? Number(partnerTier.markupPercent)
    : null;
  // Shelf / partner price may already be adjusted on storefront offers (_publicPrice)
  const publicPrice = offer
    ? parseFloat(offer._publicPrice ?? offer.price)
    : 0;
  const [influencerUnitPrice, setInfluencerUnitPrice] = useState(null);

  // Influencer unit price from server (no client-side cost)
  useEffect(() => {
    if (!offer?.id || partnerMarkup != null || !appliedCoupon?.code) {
      setInfluencerUnitPrice(null);
      return undefined;
    }
    let cancelled = false;
    fetchMyOfferUnitPrices([offer.id], appliedCoupon.code).then((map) => {
      if (cancelled) return;
      const row = map?.[offer.id] || map?.[String(offer.id)];
      const unit = Number(row?.unitPrice ?? row?.unit_price);
      setInfluencerUnitPrice(Number.isFinite(unit) && unit > 0 ? unit : null);
    });
    return () => { cancelled = true; };
  }, [offer?.id, partnerMarkup, appliedCoupon?.code]);

  const price = (() => {
    if (!offer) return 0;
    if (partnerMarkup != null) {
      // Partner prices come pre-applied on storefront offers (RPC)
      if (offer._partnerPriced && Number.isFinite(Number(offer.price))) {
        return Number(offer.price);
      }
      return resolveCustomerUnitPrice(offer, { partnerMarkupPercent: partnerMarkup });
    }
    if (appliedCoupon && influencerUnitPrice != null) {
      return influencerUnitPrice;
    }
    // Fallback if cost still present (pre-migration)
    if (appliedCoupon) {
      return resolveCustomerUnitPrice(offer, {
        influencerBuyerMarkupPercent: appliedCoupon.buyerMarkupPercent,
      });
    }
    return Number.isFinite(publicPrice) ? publicPrice : 0;
  })();
  const total = price.toFixed(2);
  const hasEnough = currentBalance >= price;
  const showCouponField = isValidOffer && user?.role !== 'admin' && partnerMarkup == null;
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
    : { uid: '', server: '', charname: '' };

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

  useEffect(() => {
    const code = game?.g2bulk_game_code;
    if (!isValidOffer || !showUidForm || !code) {
      setTopupMeta(buildTopupMetaFromGame(showUidForm ? game : null));
      return undefined;
    }

    // Seed from synced DB requirements immediately (works offline / before live fetch).
    const seeded = buildTopupMetaFromGame(game);
    let cancelled = false;
    setTopupMeta({ ...seeded, loading: true });

    g2bulkGetTopupMeta(code)
      .then((payload) => {
        if (cancelled) return;
        const fields = Array.isArray(payload?.fields) ? payload.fields : [];
        const servers = Array.isArray(payload?.servers) ? payload.servers : [];
        const notes = payload?.notes || seeded.notes || '';
        // Prefer live fields when known; otherwise keep synced seed.
        const effectiveFields = fields.length > 0 ? fields : seeded.fields;
        const effectiveServers = fields.length > 0
          ? servers
          : (servers.length > 0 ? servers : seeded.servers);
        const flags = effectiveFields.length > 0
          ? buildTopupMetaFlags(effectiveFields)
          : {
            requiresServer: payload?.requiresServer ?? seeded.requiresServer,
            requiresCharname: payload?.requiresCharname ?? seeded.requiresCharname,
          };
        setTopupMeta({
          loading: false,
          fields: effectiveFields,
          servers: effectiveServers,
          notes,
          ...flags,
        });
      })
      .catch(() => {
        if (cancelled) return;
        // Keep DB-synced requirements on live failure — do not wipe to empty.
        setTopupMeta({ ...seeded, loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [isValidOffer, showUidForm, game]);

  const isUidCompleteForStock = !showUidForm || playerUid.trim().length > 2;
  const [stockCheck, setStockCheck] = useState({
    loading: false,
    available: true,
    message: '',
    reason: null,
  });

  useEffect(() => {
    if (!isValidOffer || selectedMethod !== 'balance' || !offer?.id || !isUidCompleteForStock) {
      setStockCheck({ loading: false, available: true, message: '', reason: null });
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
          reason: result?.reason || null,
          message: result?.available ? '' : getFulfillmentUnavailableMessage(result, t),
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[fulfillment] check failed', err);
        setStockCheck({
          loading: false,
          available: false,
          reason: 'supplier_unreachable',
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
      <div className="max-w-2xl mx-auto">
        <div className="card p-8 space-y-6 animate-pulse">
          <div className="space-y-2">
            <div className="h-3 w-24 bg-[var(--border)] rounded" />
            <div className="h-8 w-48 bg-[var(--border)] rounded-lg" />
            <div className="h-4 w-64 bg-[var(--border)] rounded" />
          </div>
          <div className="h-20 bg-[var(--bg-elevated)] rounded-2xl" />
          <div className="h-12 bg-[var(--bg-elevated)] rounded-2xl" />
          <div className="h-16 bg-[var(--bg-elevated)] rounded-2xl" />
          <div className="h-14 bg-[var(--bg-elevated)] rounded-xl" />
        </div>
      </div>
    );
  }

  if (!isValidOffer) {
    return (
      <div className="max-w-md mx-auto py-16 px-2">
        <BackButton onClick={() => navigate(-1)} t={t} className="mb-6 transition-colors" />
        <EmptyState
          title={t.offerNotFound}
          action={
            <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-5">
              {t.home}
            </button>
          }
        />
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
        <BackButton onClick={() => navigate(gamePath)} t={t} className="mb-4" />
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
    ? resolvePlayerServerForOrder(game, playerServer, topupMeta)
    : null;

  const resolvedPlayerCharname = needsCharnameField ? playerCharname.trim() || null : null;

  const playerInfo = {
    player_uid: showUidForm ? playerUid.trim() || null : null,
    player_server: resolvedPlayerServer,
    player_charname: resolvedPlayerCharname,
    influencer_code: appliedCoupon?.code || null,
    influencer_buyer_markup: appliedCoupon?.buyerMarkupPercent ?? null,
  };

  const isUidComplete = !showUidForm || playerUid.trim().length > 2;
  const isServerComplete = !needsServerField || !!resolvedPlayerServer;
  const isCharnameFieldComplete = isCharnameComplete(topupMeta, playerCharname, game);
  const canProceed = isUidComplete && isServerComplete && isCharnameFieldComplete && !!currentMethod;
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
          charname: resolvedPlayerCharname || undefined,
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
          markOrderFulfillAllowed(result.orderId);
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
  const { text: offerInstructions, steps } = getOfferHowTo(offer, game, lang);
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
    markOrderFulfillAllowed(orderId);
    navigate(`/success?orderId=${orderId}`);
  };

  if (step === 'payment' || step === 'pending') {
    return (
      <div className="max-w-2xl mx-auto">
        <BackButton onClick={() => { setStep('details'); setActiveOrder(null); }} t={t} className="mb-6" />

        <div className="card p-8">
          <div className="mb-6">
            <div className="text-xs font-semibold text-[var(--accent)] mb-1">{activeMethodLabel}</div>
            <h1 className="text-2xl font-black">{formatMessage(t.completeWalletPayment, { method: activeMethodLabel })}</h1>
            <p className="mt-1 text-[var(--text-sec)]">{purchaseSubtitle}</p>
          </div>

          <div className="mb-6">
            <div className="text-sm text-[var(--text-muted)]">{t.total}</div>
            <div className="text-4xl font-black font-mono text-[var(--price)]">
              {formatMoney(activeOrder?.total != null ? parseFloat(activeOrder.total) : null, { fallback: `$${total}` })}
            </div>
            {!activeIsApiWallet && (
              <div className="text-xs text-[var(--text-sec)] mt-1">{activePaymentDisplay.merchantName}</div>
            )}
          </div>

          {activeIsApiWallet && !activeOrder?.invoice ? (
            <AlertBanner tone="amber" centered>
              <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
              <p>{t.samInvoiceUnavailable}</p>
            </AlertBanner>
          ) : activeIsApiWallet && activeOrder?.invoice ? (
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
                <AlertBanner tone="amber" centered>
                  <Clock className="w-8 h-8 mx-auto text-amber-300 mb-2" />
                  <div className="font-bold">{t.awaitingAdminApproval}</div>
                  <p className="text-xs text-[var(--text-sec)] mt-2 max-w-sm mx-auto">
                    {t.orderPendingDesc}
                  </p>
                  <CheckCircle className="w-5 h-5 mx-auto text-emerald-400 mt-3" />
                </AlertBanner>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <BackButton onClick={() => navigate(-1)} t={t} className="mb-6" />

      <div className="card p-8">
        <div className="mb-8">
          <div className="text-xs font-semibold text-[var(--accent)] mb-1">
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

        {(offerInstructions || steps.length > 0) && (
          <div className="mb-6 rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-sec)] mb-1">
              <Info className="w-4 h-4 text-[var(--accent)]" />
              {t.howToApply}
            </div>
            {offerInstructions ? (
              <div className="whitespace-pre-wrap text-[13px] text-[var(--text-sec)] leading-relaxed">
                {renderRichTextLinks(offerInstructions)}
              </div>
            ) : (
              <ol className="space-y-2">
                {steps.map((step, index) => (
                  <li key={step} className="flex gap-2 text-[13px] text-[var(--text-sec)] leading-relaxed">
                    <span className="catalog-step-num shrink-0">{index + 1}</span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        <div className="flex justify-between items-baseline mb-6 p-4 bg-[var(--bg-surface)] rounded-2xl border border-[var(--border)]">
          <div className="text-sm text-[var(--text-muted)]">{t.total}</div>
          <div className="text-end">
            {appliedCoupon && publicPrice > price + 0.0001 ? (
              <div className="text-sm line-through text-[var(--text-muted)] font-mono" dir="ltr">
                {formatMoney(publicPrice)}
              </div>
            ) : null}
            <div className="text-4xl font-black text-[var(--price)]" dir="ltr">${total}</div>
            {appliedCoupon ? (
              <div className="text-[11px] text-emerald-300 mt-1">
                {formatMessage(t.couponAppliedPriceHint, {
                  code: appliedCoupon.code,
                  markup: appliedCoupon.buyerMarkupPercent,
                })}
              </div>
            ) : null}
          </div>
        </div>

        {showCouponField ? (
          <div className="mb-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)]/60 p-4 space-y-2">
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--text-sec)]">
              <Ticket className="w-4 h-4 text-[var(--accent)]" />
              <label htmlFor="buy-coupon-input">{t.couponBuyTitle}</label>
            </div>
            <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">{t.couponBuyHelp}</p>
            {appliedCoupon ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm">
                <span className="text-emerald-100">
                  {formatMessage(t.couponAppliedOk, {
                    code: appliedCoupon.code,
                    markup: appliedCoupon.buyerMarkupPercent,
                  })}
                </span>
                <button
                  type="button"
                  className="btn btn-secondary text-[11px] py-1 px-2"
                  onClick={() => {
                    setAppliedCoupon(null);
                    setCouponInput('');
                    setCouponError('');
                    setCouponOkMsg('');
                  }}
                >
                  {t.couponClear}
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  id="buy-coupon-input"
                  className="input text-sm flex-1 min-w-0 font-mono"
                  placeholder={t.couponRedeemPlaceholder}
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  dir="ltr"
                  disabled={couponApplying}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      document.getElementById('buy-apply-coupon-btn')?.click();
                    }
                  }}
                />
                <button
                  id="buy-apply-coupon-btn"
                  type="button"
                  disabled={couponApplying || !couponInput.trim()}
                  onClick={async () => {
                    setCouponError('');
                    setCouponOkMsg('');
                    setCouponApplying(true);
                    try {
                      const res = await validateInfluencerCoupon(couponInput.trim());
                      setAppliedCoupon(res);
                      setCouponOkMsg(
                        formatMessage(t.couponApplySuccess, {
                          code: res.code,
                          pct: res.buyerMarkupPercent,
                        }),
                      );
                    } catch (err) {
                      setAppliedCoupon(null);
                      setCouponError(couponErrorMessage(err?.message || 'coupon_invalid', t));
                    } finally {
                      setCouponApplying(false);
                    }
                  }}
                  className="btn btn-secondary text-sm py-2 px-4 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {couponApplying ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {couponApplying ? t.couponChecking : t.couponApplyBtn}
                </button>
              </div>
            )}
            {couponOkMsg && !appliedCoupon ? (
              <p className="text-xs text-emerald-300">{couponOkMsg}</p>
            ) : null}
            {couponError ? (
              <p className="text-xs text-red-300">{couponError}</p>
            ) : null}
          </div>
        ) : null}

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
                  <Zap className="w-3.5 h-3.5 text-[var(--accent)]" />
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
                  onClick={() => {
                    setRedemptionChoice('redeem_code');
                    setPlayerUid('');
                    setPlayerServer('');
                    setPlayerCharname('');
                  }}
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
                className="input w-full text-lg font-mono"
              />
              {savedGamePlayer.uid && (
                <p className="text-[10px] text-[var(--text-muted)] mt-1.5">{t.gameUidAutofillHint}</p>
              )}
            </div>
          )}

          {needsServerField && (
            <div className="mb-3">
              <ServerIdField
                game={game}
                topupMeta={topupMeta}
                value={playerServer}
                onChange={setPlayerServer}
                t={t}
                required
                inputClassName="input w-full font-mono"
                selectClassName="input w-full"
              />
            </div>
          )}

          {needsCharnameField && (
            <div className="mb-3">
              <CharnameField
                game={game}
                topupMeta={topupMeta}
                value={playerCharname}
                onChange={setPlayerCharname}
                t={t}
                required
                inputClassName="input w-full"
              />
            </div>
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
          <AlertBanner tone="amber" className="mb-6">
            {t.walletManualNotReady}
          </AlertBanner>
        )}

        <div className="mb-6">
          <div className="font-semibold mb-3 text-sm text-[var(--text-sec)]">{t.paymentMethod}</div>
          <div className="space-y-2">
            {paymentMethods.map((m) => {
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
                  <span className={`payment-method-icon-wrap me-4 flex-shrink-0 ${m.color || ''}`}>
                    <PaymentMethodIcon method={m} className="w-8 h-8" />
                  </span>
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
                      <div className="text-xs text-emerald-400">({formatMoney(currentBalance)})</div>
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
            <p>{stockCheck.message || t.fulfillmentOutOfStock}</p>
            {stockCheck.reason ? (
              <p className="text-[11px] opacity-70 mt-1 font-mono" dir="ltr">
                reason: {stockCheck.reason}
              </p>
            ) : null}
          </AlertBanner>
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