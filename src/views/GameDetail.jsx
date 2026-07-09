import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Globe, Loader2, Ticket, Zap } from 'lucide-react';
import AdminEditButton from '../components/admin/AdminEditButton';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';
import CatalogHero from '../components/catalog/CatalogHero';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import OfferPackCard from '../components/catalog/OfferPackCard';
import { isGamingAccountGame, isVoucherGame } from '../lib/catalogUtils';
import { getGameDisplayName } from '../lib/offerDisplay';
import {
  findVariantByRegionParam,
  getChildGameIds,
  getGameBaseMeta,
  getRegionVariantsWithOffers,
  pickDefaultVariant,
  regionParamSlug,
  resolveStorefrontGame,
  storefrontGameHasOffers,
} from '../lib/gameRegions';
import { fetchLiveGameGroup, isLiveCatalogId } from '../lib/liveCatalog';
import { sortOffersByPrice } from '../lib/offerDisplay';
import { buildGameBreadcrumb } from '../lib/catalogNav';

export default function GameDetail({
  games,
  offers,
  t = {},
  lang,
  navigate,
  user,
  updateProduct,
  updateGame,
  deleteGame,
  loadingGames = false,
  catalogMode = 'sync',
  onLiveCatalogUpdate,
  onSelectOffer,
  onBuyNow,
}) {
  const [loadingLiveGroup, setLoadingLiveGroup] = useState(false);
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const matchedGame = games.find((g) => (g.slug || g.id) === slug) || games.find((g) => g.id === slug);
  const storefrontGame = resolveStorefrontGame(games, matchedGame);
  const isAdmin = user?.role === 'admin';
  const isAr = lang === 'ar';

  const regionVariants = useMemo(
    () => (storefrontGame ? getRegionVariantsWithOffers(games, storefrontGame.id, offers) : []),
    [games, storefrontGame, offers],
  );
  const isAccount = isGamingAccountGame(storefrontGame);
  const isVoucher = isVoucherGame(storefrontGame);
  const hasOffers = isVoucher
    ? offers.some((offer) => offer.game_id === storefrontGame?.id && offer.active !== false)
    : storefrontGameHasOffers(storefrontGame, games, offers);
  const hasRegions = !isVoucher && regionVariants.length > 1;
  const regionParam = searchParams.get('region') || '';

  const [selectedVariantId, setSelectedVariantId] = useState(null);
  const [editingOffer, setEditingOffer] = useState(null);
  const [editingGame, setEditingGame] = useState(false);

  useEffect(() => {
    const usesLiveCatalog = catalogMode === 'live'
      || (catalogMode === 'hybrid' && (
        storefrontGame?.catalog_source === 'live'
        || isLiveCatalogId(storefrontGame?.id)
      ));
    if (!usesLiveCatalog || !storefrontGame || isVoucherGame(storefrontGame)) return undefined;

    const baseKey = storefrontGame.group_base_key || getGameBaseMeta(storefrontGame).baseKey;
    if (!baseKey) return undefined;

    let cancelled = false;
    setLoadingLiveGroup(true);
    fetchLiveGameGroup(baseKey)
      .then((payload) => {
        if (cancelled) return;
        onLiveCatalogUpdate?.(payload);
      })
      .catch((err) => {
        if (!cancelled) console.error('Live game group load failed:', err);
      })
      .finally(() => {
        if (!cancelled) setLoadingLiveGroup(false);
      });

    return () => { cancelled = true; };
  }, [catalogMode, storefrontGame, onLiveCatalogUpdate]);

  useEffect(() => {
    if (!storefrontGame) return;

    if (regionVariants.length === 0) {
      const childIds = getChildGameIds(games, storefrontGame);
      const fallbackId = childIds.find((id) => offers.some((offer) => offer.game_id === id && offer.active !== false))
        || childIds[0]
        || storefrontGame.id;
      setSelectedVariantId(fallbackId);
      return;
    }

    const fromParam = findVariantByRegionParam(regionVariants, regionParam);
    const fromDirectChild = matchedGame?.parent_game_id
      ? regionVariants.find((variant) => variant.id === matchedGame.id)
      : (matchedGame?.g2bulk_game_code
        ? regionVariants.find((variant) => variant.id === matchedGame.id)
        : null);
    const nextVariant = fromParam || fromDirectChild || pickDefaultVariant(regionVariants, offers);
    setSelectedVariantId(nextVariant?.id || storefrontGame.id);
  }, [storefrontGame, regionVariants, regionParam, matchedGame, offers, games]);

  const activeVariant = regionVariants.find((variant) => variant.id === selectedVariantId)
    || (regionVariants.length === 0 ? storefrontGame : pickDefaultVariant(regionVariants, offers));
  const activeGameId = activeVariant?.id || storefrontGame?.id;

  const gameOffers = useMemo(() => sortOffersByPrice(
    offers.filter((offer) => offer.game_id === activeGameId && offer.active !== false),
  ), [offers, activeGameId]);

  const handleRegionSelect = (variant) => {
    if (!variant) return;
    setSelectedVariantId(variant.id);
    const next = new URLSearchParams(searchParams);
    next.set('region', regionParamSlug(variant.region_label));
    setSearchParams(next, { replace: true });
  };

  if (loadingGames || loadingLiveGroup || (!storefrontGame && games.length === 0)) {
    return (
      <div className="max-w-4xl mx-auto py-16 sm:py-20">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin" />
          <p className="text-[var(--text-sec)]">{t.loadingGame}</p>
        </div>
      </div>
    );
  }

  if (!storefrontGame || (!isAdmin && !hasOffers)) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.gameNotFound}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  const game = storefrontGame;
  const gameName = getGameDisplayName(game, lang);
  const { breadcrumb, backLabel, backPath } = buildGameBreadcrumb(game, t, lang, navigate);
  const displayServers = isVoucher ? [] : (Array.isArray(activeVariant?.servers) ? activeVariant.servers : []);
  const heroBadges = isAccount
    ? [{ label: t.accountBadge || (isAr ? 'استرداد' : 'Redeem'), className: 'border-sky-400/30 bg-sky-500/15 text-sky-200' }]
    : isVoucher
      ? [{ label: t.giftCard || (isAr ? 'بطاقة هدايا' : 'Gift card'), className: 'border-violet-400/30 bg-violet-500/15 text-violet-200' }]
      : [{ label: `${game.points_name || 'Top-up'}`, className: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]' }];

  if (activeVariant?.region_label && !isVoucher) {
    heroBadges.push({
      label: activeVariant.region_label,
      className: 'border-white/15 bg-white/10 text-white/90',
    });
  }

  return (
    <CatalogPageShell
      lang={lang}
      backLabel={`${isAr ? 'عودة إلى' : 'Back to'} ${backLabel}`}
      onBack={() => navigate(backPath)}
      breadcrumb={breadcrumb}
      adminActions={isAdmin && (
        <AdminEditButton
          label={t.editGame || (isAr ? 'تعديل اللعبة' : 'Edit game')}
          onClick={() => setEditingGame(true)}
        />
      )}
    >
      <CatalogHero
        imageUrl={game.image_url}
        logoUrl={game.logo_url}
        title={gameName}
        subtitle={isAccount
          ? (t.redeemSubtitle || t.redeemMeta || (isAr ? 'كود استرداد للمنصة — اشحن اشتراكك أو محفظتك' : 'Platform redeem code — recharge your subscription or wallet'))
          : isVoucher
            ? (t.giftCard || (isAr ? 'بطاقات هدايا وأكواد شحن' : 'Gift cards & voucher codes'))
            : `${game.points_name || 'Top-up'} ${isAr ? 'شحن فوري' : 'instant top-up'}`}
        meta={isAccount || isVoucher
          ? (t.voucherRedemption || (isAr ? 'استلام: كود فوري بعد الدفع' : 'Delivery: instant code after payment'))
          : `${t.redemptionMethod || 'Redemption'}: ${
            game.redemption_method === 'uid'
              ? (t.redemptionUid || 'UID')
              : game.redemption_method === 'redeem_code'
                ? (t.redemptionCode || 'Redeem code')
                : (t.redemptionBoth || 'UID or code')
          }${displayServers.length > 0 ? ` · ${displayServers.join(' • ')}` : ''}`}
        badges={heroBadges}
      />

      {(isVoucher || isAccount) && (
        <div className={`catalog-info-banner mb-6 sm:mb-8 ${isAccount ? 'catalog-info-banner--redeem' : 'catalog-info-banner--voucher'}`}>
          <Ticket className={`w-5 h-5 shrink-0 ${isAccount ? 'text-sky-300' : 'text-violet-300'}`} />
          <div className="text-sm text-[var(--text-sec)] space-y-2 min-w-0">
            <p className={`font-semibold ${isAccount ? 'text-sky-100' : 'text-violet-100'}`}>
              {isAccount
                ? (t.howRedeemWorks || (isAr ? 'كيف يعمل الاسترداد؟' : 'How redeem codes work'))
                : (t.howVouchersWork || (isAr ? 'كيف تعمل بطاقات الهدايا؟' : 'How gift cards work'))}
            </p>
            <ol className="list-decimal ps-5 space-y-1 text-xs leading-relaxed">
              <li>{t.voucherStep1 || (isAr ? 'اختر الباقة وادفع' : 'Pick a pack and pay')}</li>
              <li>{t.voucherStep2 || (isAr ? 'انسخ الكود من إيصال الطلب' : 'Copy the code from your order receipt')}</li>
              <li>{t.voucherStep3 || (isAr ? 'فعّل الكود داخل اللعبة أو المنصة' : 'Redeem in-game or on the platform')}</li>
            </ol>
            <p className="text-[10px] text-[var(--text-muted)] inline-flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {t.voucherStockNote || (isAr ? 'العروض غير المتوفرة تُخفى تلقائياً' : 'Out-of-stock packs are hidden automatically')}
            </p>
          </div>
        </div>
      )}

      {hasRegions && !isVoucher && (
        <section className="catalog-region-picker mb-6 sm:mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-base sm:text-lg font-bold">{t.selectRegion || (isAr ? 'اختر المنطقة' : 'Select region')}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {regionVariants.map((variant) => {
              const isActive = variant.id === activeGameId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => handleRegionSelect(variant)}
                  className={`catalog-region-chip px-4 py-2 rounded-full text-sm font-semibold border transition touch-manipulation ${
                    isActive
                      ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-white'
                      : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/50'
                  }`}
                >
                  {variant.region_label}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {t.regionOffersNote || (isAr
              ? 'الأسعار تختلف حسب المنطقة — اختر منطقة حسابك قبل الشراء.'
              : 'Prices vary by region — pick your account region before buying.')}
          </p>
        </section>
      )}

      <section>
        <div className="flex items-end justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{t.availableOffers || (isAr ? 'الباقات المتاحة' : 'Available packs')}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {gameOffers.length} {isAr ? 'عرض' : 'offer'}{gameOffers.length === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {gameOffers.length > 0 ? (
          <div className="catalog-offer-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {gameOffers.map((offer) => (
              <OfferPackCard
                key={offer.id}
                offer={offer}
                game={game}
                lang={lang}
                t={t}
                regionLabel={offer.region || activeVariant?.region_label}
                isAdmin={isAdmin}
                onSelect={onSelectOffer}
                onBuyNow={onBuyNow}
                onEdit={setEditingOffer}
              />
            ))}
          </div>
        ) : (
          <div className="card p-8 text-center text-[var(--text-sec)]">{t.noOffers}</div>
        )}
      </section>

      {isAdmin && editingGame && (
        <AdminGameEditModal
          game={game}
          lang={lang}
          t={t}
          onClose={() => setEditingGame(false)}
          onSave={updateGame}
          onDelete={deleteGame ? async (gameId) => {
            await deleteGame(gameId);
            navigate('/');
          } : undefined}
        />
      )}
      {isAdmin && editingOffer && (
        <AdminOfferEditModal
          offer={editingOffer}
          games={games}
          lang={lang}
          t={t}
          onClose={() => setEditingOffer(null)}
          onSave={updateProduct}
        />
      )}
    </CatalogPageShell>
  );
}