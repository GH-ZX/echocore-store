import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowLeftRight, Loader2, Ticket, Zap } from 'lucide-react';
import AdminEditButton from '../components/admin/AdminEditButton';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import { getAdminGiftPath } from '../lib/adminRoutes';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';
import CatalogHero from '../components/catalog/CatalogHero';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import OfferPackCard from '../components/catalog/OfferPackCard';
import { isGamingAccountGame, isVoucherGame } from '../lib/catalogUtils';
import { getGameDisplayName } from '../lib/offerDisplay';
import { getGameMarketingDescription } from '../lib/gameDescriptions';
import { resolveStorefrontGame } from '../lib/gameRegions';
import { sortOffersByPrice } from '../lib/offerDisplay';
import { buildGameBreadcrumb } from '../lib/catalogNav';
import { formatMessage } from '../lib/i18n';
import {
  buildSearchPath,
  getCatalogSearchQuery,
  SEARCH_FILTER_GIFT_CARD,
  SEARCH_FILTER_TOPUP,
  topupHasGiftCardAlternative,
  voucherHasTopupAlternative,
} from '../lib/searchUtils';

export default function GameDetail({
  games,
  offers,
  t = {},
  lang,
  navigate,
  user,
  updateProduct,
  onPricingSaved,
  onOffersPricingApplied,
  updateGame,
  deleteGame,
  loadingGames = false,
  onSelectOffer,
  onBuyNow,
}) {
  const { slug } = useParams();
  const matchedGame = games.find((g) => (g.slug || g.id) === slug) || games.find((g) => g.id === slug);
  const storefrontGame = resolveStorefrontGame(games, matchedGame);
  const isAdmin = user?.role === 'admin';
  const isAccount = isGamingAccountGame(storefrontGame);
  const isVoucher = isVoucherGame(storefrontGame);
  const hasOffers = !storefrontGame ? false : offers.some((offer) => offer.game_id === storefrontGame.id && offer.active !== false);

  const [editingOffer, setEditingOffer] = useState(null);
  const [editingGame, setEditingGame] = useState(false);
  const activeGameId = storefrontGame?.id ?? null;
  const gameOffers = sortOffersByPrice(
    offers.filter((offer) => offer.game_id === activeGameId && offer.active !== false),
  );

  const showGiftCodeAlt = useMemo(
    () => (storefrontGame && !isVoucher && !isAccount
      ? topupHasGiftCardAlternative(storefrontGame, games, offers)
      : false),
    [storefrontGame, games, offers, isVoucher, isAccount],
  );

  const showTopupAlt = useMemo(
    () => (storefrontGame && isVoucher && !isAccount
      ? voucherHasTopupAlternative(storefrontGame, games, offers)
      : false),
    [storefrontGame, games, offers, isVoucher, isAccount],
  );

  const catalogSearchQuery = storefrontGame ? getCatalogSearchQuery(storefrontGame) : '';

  if (loadingGames || (!storefrontGame && games.length === 0)) {
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
  const gameDescription = getGameMarketingDescription(game, lang, games, offers, t);
  const { breadcrumb, backLabel, backPath } = buildGameBreadcrumb(game, t, lang, navigate);
  const heroBadges = isAccount
    ? [{ label: t.accountBadge, className: 'border-sky-400/30 bg-sky-500/15 text-sky-200' }]
    : isVoucher
      ? [{ label: t.giftCard, className: 'border-violet-400/30 bg-violet-500/15 text-violet-200' }]
      : [{ label: `${game.points_name || 'Top-up'}`, className: 'border-[var(--accent)]/30 bg-[var(--accent)]/10 text-[var(--accent)]' }];

  if (game.region_label && !isVoucher) {
    heroBadges.push({
      label: game.region_label,
      className: 'border-white/15 bg-white/10 text-white/90',
    });
  }

  return (
    <CatalogPageShell
      lang={lang}
      backLabel={`${t.backToPrefix} ${backLabel}`}
      onBack={() => navigate(backPath)}
      breadcrumb={breadcrumb}
      adminActions={isAdmin && (
        <AdminEditButton
          label={t.editGame}
          onClick={() => setEditingGame(true)}
        />
      )}
    >
      <CatalogHero
        imageUrl={game.image_url}
        logoUrl={game.logo_url}
        title={gameName}
        subtitle={isAccount
          ? t.redeemSubtitle
          : isVoucher
            ? t.giftCardsSubtitle
            : (gameDescription || `${game.points_name || 'Top-up'} ${t.instantTopUpSuffix}`)}
        meta={isAccount || isVoucher
          ? t.voucherRedemption
          : `${t.redemptionMethod}: ${
            game.redemption_method === 'uid'
              ? t.redemptionUid
              : game.redemption_method === 'redeem_code'
                ? t.redemptionCode
                : t.redemptionBoth
          }`}
        badges={heroBadges}
      />

      {showTopupAlt && (
        <div className="catalog-info-banner catalog-info-banner--topup mb-6 sm:mb-8">
          <Zap className="w-5 h-5 shrink-0 text-[var(--accent)]" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              {t.voucherTopupPrompt}
            </p>
            <button
              type="button"
              onClick={() => navigate(buildSearchPath({
                q: catalogSearchQuery,
                type: SEARCH_FILTER_TOPUP,
              }))}
              className="btn btn-primary shrink-0 text-sm px-4 py-2"
            >
              {t.voucherTopupCta}
            </button>
          </div>
        </div>
      )}

      {showGiftCodeAlt && (
        <div className="catalog-info-banner catalog-info-banner--voucher mb-6 sm:mb-8">
          <ArrowLeftRight className="w-5 h-5 shrink-0 text-violet-300" />
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 min-w-0 flex-1">
            <p className="text-sm font-semibold text-violet-100">
              {t.topupGiftCodePrompt}
            </p>
            <button
              type="button"
              onClick={() => navigate(buildSearchPath({
                q: catalogSearchQuery,
                type: SEARCH_FILTER_GIFT_CARD,
              }))}
              className="btn btn-secondary shrink-0 text-sm px-4 py-2 border-violet-400/35 bg-violet-500/15 text-violet-100 hover:bg-violet-500/25"
            >
              {t.topupGiftCodeCta}
            </button>
          </div>
        </div>
      )}

      {(isVoucher || isAccount) && (
        <div className={`catalog-info-banner mb-6 sm:mb-8 ${isAccount ? 'catalog-info-banner--redeem' : 'catalog-info-banner--voucher'}`}>
          <Ticket className={`w-5 h-5 shrink-0 ${isAccount ? 'text-sky-300' : 'text-violet-300'}`} />
          <div className="text-sm text-[var(--text-sec)] space-y-2 min-w-0">
            <p className={`font-semibold ${isAccount ? 'text-sky-100' : 'text-violet-100'}`}>
              {isAccount ? t.howRedeemWorks : t.howVouchersWork}
            </p>
            <ol className="list-decimal ps-5 space-y-1 text-xs leading-relaxed">
              <li>{t.voucherStep1}</li>
              <li>{t.voucherStep2}</li>
              <li>{t.voucherStep3}</li>
            </ol>
            <p className="text-[10px] text-[var(--text-muted)] inline-flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {t.voucherStockNote}
            </p>
          </div>
        </div>
      )}

      <section>
        <div className="flex items-end justify-between gap-3 mb-4 sm:mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold">{t.availableOffers}</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              {formatMessage(
                gameOffers.length === 1 ? t.offerCountOne : t.offerCountMany,
                { count: gameOffers.length },
              )}
            </p>
          </div>
        </div>

        {gameOffers.length > 0 ? (
          <div>
            <div className="catalog-offer-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {gameOffers.map((offer) => (
                <OfferPackCard
                  key={`${activeGameId}:${offer.id}`}
                  offer={offer}
                  game={game}
                  catalogGames={games}
                  catalogOffers={offers}
                  lang={lang}
                  t={t}
                  regionLabel={offer.region || game.region_label}
                  isAdmin={isAdmin}
                  onSelect={onSelectOffer}
                  onBuyNow={onBuyNow}
                onGift={isAdmin ? (giftOffer) => navigate(getAdminGiftPath({
                  offerId: giftOffer.id,
                  returnTo: `/game/${slug}`,
                })) : undefined}
                  onEdit={setEditingOffer}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="card p-8 text-center text-[var(--text-sec)]">
            {t.noOffers}
          </div>
        )}
      </section>

      {isAdmin && editingGame && (
        <AdminGameEditModal
          game={game}
          games={games}
          offers={offers}
          lang={lang}
          t={t}
          onClose={() => setEditingGame(false)}
          onSave={updateGame}
          onDelete={deleteGame ? async (gameId) => {
            await deleteGame(gameId);
            navigate('/');
          } : undefined}
          onOffersPricingApplied={(result) => {
            if (result?.offers?.length) onOffersPricingApplied?.(result.offers);
          }}
        />
      )}
      {isAdmin && editingOffer && (
        <AdminOfferEditModal
          offer={editingOffer}
          games={games}
          offers={offers}
          lang={lang}
          t={t}
          onClose={() => setEditingOffer(null)}
          onSave={updateProduct}
          onPricingSaved={onPricingSaved}
        />
      )}
    </CatalogPageShell>
  );
}