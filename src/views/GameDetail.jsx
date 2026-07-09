import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Globe, Loader2 } from 'lucide-react';
import { presetImageUrl } from '../lib/imageUtils';
import AdminEditButton from '../components/admin/AdminEditButton';
import BorderGlow from '../components/ui/BorderGlow';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';
import { Ticket, Zap } from 'lucide-react';
import { isVoucherGame } from '../lib/catalogUtils';
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
import { brandUserText } from '../lib/branding';

export default function GameDetail({
  games,
  offers,
  t = {},
  lang,
  navigate,
  addToCart: _addToCart,
  user,
  updateProduct,
  updateGame,
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
  const regionVariants = useMemo(
    () => (storefrontGame ? getRegionVariantsWithOffers(games, storefrontGame.id, offers) : []),
    [games, storefrontGame, offers],
  );
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
  }, [catalogMode, storefrontGame?.id, storefrontGame?.group_base_key, onLiveCatalogUpdate]);

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

  const gameOffers = useMemo(() => (
    offers.filter((offer) => offer.game_id === activeGameId && offer.active !== false)
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
          <p className="text-[var(--text-sec)]">
            {t.loadingGame}
          </p>
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
  const displayServers = isVoucher ? [] : (Array.isArray(activeVariant?.servers) ? activeVariant.servers : []);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary text-sm sm:text-base">
          {t.backToHome || (lang === 'ar' ? 'العودة إلى الرئيسية' : '← Back to Home')}
        </button>
        {isAdmin && (
          <AdminEditButton
            label={t.editGame || (lang === 'ar' ? 'تعديل اللعبة' : 'Edit Game')}
            onClick={() => setEditingGame(true)}
          />
        )}
      </div>

      <div className="card overflow-hidden mb-8">
        <div className="relative h-72 md:h-96">
          {game.image_url && (
            <img
              src={presetImageUrl(game.image_url, 'heroCover')}
              alt={lang === 'ar' ? game.name_ar : game.name_en}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-0 p-6 md:p-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white">
              {brandUserText(lang === 'ar' ? game.name_ar : game.name_en)}
            </h1>
            <p className="text-white/70 text-lg mt-1">
              {isVoucher
                ? (lang === 'ar' ? t.giftCard || 'بطاقة هدايا' : t.giftCard || 'Gift card & voucher codes')
                : `${game.points_name} Top-ups`}
            </p>
            <p className="text-white/50 text-sm mt-1">
              {isVoucher
                ? (t.voucherRedemption || (lang === 'ar' ? 'استلام: كود شحن فوري بعد الدفع' : 'Delivery: instant redeem code after payment'))
                : `${t.redemptionMethod || 'Redemption'}: ${game.redemption_method === 'uid' ? (t.redemptionUid || 'UID') : game.redemption_method === 'redeem_code' ? (t.redemptionCode || 'Redeem Code') : (t.redemptionBoth || 'UID or Redeem Code')}`}
            </p>
            {displayServers.length > 0 && (
              <p className="text-white/40 text-xs mt-0.5">{t.availableServers}: {displayServers.join(' • ')}</p>
            )}
          </div>
        </div>
      </div>

      {isVoucher && (
        <div className="mb-8 rounded-2xl border border-violet-500/25 bg-violet-500/10 p-5">
          <div className="flex items-start gap-3">
            <Ticket className="w-5 h-5 text-violet-300 mt-0.5 shrink-0" />
            <div className="text-sm text-[var(--text-sec)] space-y-2">
              <p className="font-semibold text-violet-100">
                {t.howVouchersWork || (lang === 'ar' ? 'كيف تعمل بطاقات الهدايا؟' : 'How gift cards work')}
              </p>
              <ol className="list-decimal ps-5 space-y-1 text-xs leading-relaxed">
                <li>{t.voucherStep1 || (lang === 'ar' ? 'اختر الباقة وادفع' : 'Pick a pack and pay')}</li>
                <li>{t.voucherStep2 || (lang === 'ar' ? 'انسخ الكود من إيصال الطلب' : 'Copy the code from your order receipt')}</li>
                <li>{t.voucherStep3 || (lang === 'ar' ? 'فعّل الكود داخل اللعبة أو المنصة' : 'Redeem it in-game or on the platform')}</li>
              </ol>
              <p className="text-[10px] text-[var(--text-muted)] inline-flex items-center gap-1">
                <Zap className="w-3 h-3" />
                {t.voucherStockNote || (lang === 'ar' ? 'العروض غير المتوفرة تُخفى تلقائياً عند نفاد المخزون' : 'Out-of-stock packs are hidden automatically')}
              </p>
            </div>
          </div>
        </div>
      )}

      {hasRegions && !isVoucher && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-[var(--accent)]" />
            <h2 className="text-lg font-bold">{t.selectRegion || (lang === 'ar' ? 'اختر المنطقة' : 'Select region')}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            {regionVariants.map((variant) => {
              const isActive = variant.id === activeGameId;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => handleRegionSelect(variant)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
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
            {t.regionOffersNote || (lang === 'ar'
              ? 'الأسعار والعروض تختلف حسب المنطقة. اختر منطقة حسابك قبل الشراء.'
              : 'Prices and packs vary by region. Choose your account region before buying.')}
          </p>
        </div>
      )}

      <h2 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6">{t.availableOffers}</h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {gameOffers.length > 0 ? (
          gameOffers.map((offer) => (
            <BorderGlow
              key={offer.id}
              edgeSensitivity={25}
              borderRadius={16}
              glowRadius={28}
              glowIntensity={0.8}
              coneSpread={25}
              fillOpacity={0.35}
            >
            <div
              onClick={() => onSelectOffer?.(offer)}
              className="p-4 sm:p-5 cursor-pointer group active:scale-[0.985] transition-all flex flex-col relative"
            >
              {isAdmin && (
                <div className="absolute top-3 right-3 z-10">
                  <AdminEditButton
                    iconOnly
                    label={t.edit || 'Edit'}
                    onClick={() => setEditingOffer(offer)}
                  />
                </div>
              )}
              <div className="flex items-center gap-2.5 mb-2.5">
                {game.logo_url && (
                  <img
                    src={game.logo_url}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="w-7 h-7 object-contain rounded-sm flex-shrink-0 ring-1 ring-white/10 group-hover:ring-[var(--accent)]/30 transition-all"
                  />
                )}
                <div className="text-xs font-medium text-[var(--text-sec)] truncate">
                  {brandUserText(lang === 'ar' ? game.name_ar : game.name_en)}
                </div>
              </div>

              <div className="font-bold text-base sm:text-lg leading-tight mb-1 line-clamp-2 flex-1">
                {brandUserText(lang === 'ar' ? offer.name_ar : offer.name_en)}
              </div>

              {(offer.region || activeVariant?.region_label) && (
                <div className="text-[10px] text-[var(--text-sec)] mb-2.5">
                  {t.region}: {offer.region || activeVariant?.region_label}
                </div>
              )}

              <div className="mt-auto pt-2 border-t border-[var(--border)]">
                {offer.is_sale && offer.original_price ? (
                  <div>
                    <div className="text-xs line-through text-[var(--text-sec)]">${parseFloat(offer.original_price).toFixed(2)}</div>
                    <div className="flex items-baseline gap-2">
                      <div className="text-2xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                      <div className="text-[9px] px-1.5 py-px bg-red-500/15 text-red-400 rounded font-medium tracking-wide">SALE</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-2xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onBuyNow?.(offer); }}
                  className="flex-1 btn btn-primary text-xs py-2 font-semibold active:scale-[0.985]"
                >
                  {t.buyNow}
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onSelectOffer?.(offer); }}
                  className="flex-1 btn btn-secondary text-xs py-2"
                >
                  {t.details || (lang === 'ar' ? 'تفاصيل' : 'Details')}
                </button>
              </div>
            </div>
            </BorderGlow>
          ))
        ) : (
          <div className="text-[var(--text-sec)] col-span-full">{t.noOffers}</div>
        )}
      </div>

      {isAdmin && editingGame && (
        <AdminGameEditModal
          game={game}
          lang={lang}
          t={t}
          onClose={() => setEditingGame(false)}
          onSave={updateGame}
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
    </div>
  );
}