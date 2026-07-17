import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { FileText, Globe, List, Loader2, Package, Zap } from 'lucide-react';
import AdminEditButton from '../components/admin/AdminEditButton';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';
import CatalogHero from '../components/catalog/CatalogHero';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import AdminOfferCostBadge from '../components/admin/AdminOfferCostBadge';
import AdminInlinePriceEdit from '../components/admin/AdminInlinePriceEdit';
import OfferPurchasePanel from '../components/catalog/OfferPurchasePanel';
import {
  getGameDisplayName,
  getOfferDisplayName,
  getRedemptionSteps,
} from '../lib/offerDisplay';
import { getOfferDescription } from '../lib/offerDescriptions';
import { resolveOfferRoute } from '../lib/offerRoutes';
import { buildGameBreadcrumb } from '../lib/catalogNav';
import MobileBuyBar from '../components/catalog/MobileBuyBar';

function redemptionMethodLabel(game, t) {
  if (game?.redemption_method === 'uid') return t.redemptionUid;
  if (game?.redemption_method === 'redeem_code') return t.redemptionCode;
  if (game?.redemption_method) return t.redemptionBoth;
  return t.instantDelivery;
}

export default function OfferDetail({
  games,
  offers,
  t = {},
  lang,
  navigate,
  addToCart,
  user,
  updateProduct,
  onPricingSaved,
  onOffersPricingApplied,
  updateGame,
  deleteGame,
  loadingCatalog = false,
  onBuyNow,
  onNotify,
}) {
  const { gameSlug, offerSlug } = useParams();
  const { offer, game, storefrontGame } = resolveOfferRoute(offers, games, { gameSlug, offerSlug });
  const displayGame = storefrontGame || game;
  const isAdmin = user?.role === 'admin';
  const [editingOffer, setEditingOffer] = useState(false);
  const [editingGame, setEditingGame] = useState(false);

  if (loadingCatalog || (!offer && offers.length === 0)) {
    return (
      <div className="max-w-4xl mx-auto py-16 sm:py-20">
        <div className="flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-9 h-9 text-[var(--accent)] animate-spin" />
          <p className="text-[var(--text-sec)]">{t.loadingOffer}</p>
        </div>
      </div>
    );
  }

  if (!offer) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.offerNotFound}</p>
        <button type="button" onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  const descriptionContext = { game, games, relatedOffers: offers };
  const gameName = displayGame ? getGameDisplayName(displayGame, lang) : '';
  const offerName = getOfferDisplayName(offer, lang, descriptionContext);
  const description = getOfferDescription(offer, lang, descriptionContext, t);
  const steps = getRedemptionSteps(game, t, lang);
  const heroImage = offer.sale_image_url || offer.image_url || displayGame?.image_url;
  const catalogTrail = displayGame
    ? buildGameBreadcrumb(displayGame, t, lang, navigate, { offerName })
    : null;
  const regionLabel = offer.region || game?.region_label || null;
  const deliveryLabel = redemptionMethodLabel(game, t);

  return (
    <CatalogPageShell
      lang={lang}
      backLabel={displayGame
        ? `${t.backToPrefix} ${gameName}`
        : t.backToHome}
      onBack={() => (displayGame ? navigate(`/game/${displayGame.slug || displayGame.id}`) : navigate('/'))}
      breadcrumb={catalogTrail?.breadcrumb || [{ label: offerName }]}
      adminActions={isAdmin && (
        <>
          <AdminEditButton label={t.editOffer} onClick={() => setEditingOffer(true)} />
          {game && (
            <AdminEditButton label={t.editGame} onClick={() => setEditingGame(true)} />
          )}
        </>
      )}
    >
      <CatalogHero
        compact
        imageUrl={heroImage}
        logoUrl={displayGame?.logo_url}
        title={offerName}
        subtitle={gameName || description}
        meta={regionLabel}
        badges={offer.is_sale ? [{ label: t.sale, className: 'border-red-400/30 bg-red-500/15 text-red-200' }] : []}
      />

      <div className="catalog-detail-layout grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] gap-6 lg:gap-8 items-start">
        <OfferPurchasePanel
          offer={offer}
          game={game}
          games={games}
          catalogOffers={offers}
          t={t}
          lang={lang}
          isAdmin={isAdmin}
          onBuyNow={onBuyNow}
          onAddToCart={addToCart}
          onPricingSaved={onPricingSaved}
          onNotify={onNotify}
          className="order-1 lg:order-2 lg:sticky lg:top-24"
        />

        <div className="space-y-5 sm:space-y-6 min-w-0 order-2 lg:order-1">
          <section className="card p-5 sm:p-6 catalog-offer-meta-panel">
            <div className="catalog-offer-meta-row">
              {gameName && (
                <div className="catalog-offer-meta-chip">
                  <Package className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="catalog-offer-meta-chip__label">{t.offerDetailYouReceiveLabel}</span>
                  <strong className="offer-pack-label">{offerName}</strong>
                </div>
              )}
              {regionLabel && (
                <div className="catalog-offer-meta-chip">
                  <Globe className="w-3.5 h-3.5 shrink-0 text-[var(--accent)]" />
                  <span className="catalog-offer-meta-chip__label">{t.region}</span>
                  <strong>{regionLabel}</strong>
                </div>
              )}
              <div className="catalog-offer-meta-chip">
                <Zap className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span className="catalog-offer-meta-chip__label">{t.offerDetailDeliveryLabel}</span>
                <strong>{deliveryLabel}</strong>
              </div>
            </div>
          </section>

          <section className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-bold text-lg sm:text-xl inline-flex items-center gap-2">
                <FileText className="w-5 h-5 text-[var(--accent)] shrink-0" />
                {t.description}
              </h2>
              {isAdmin && (
                <AdminEditButton label={t.edit} onClick={() => setEditingOffer(true)} />
              )}
            </div>
            <p className="text-[var(--text-sec)] leading-relaxed text-sm sm:text-base">
              {description}
            </p>
          </section>

          <section className="card p-5 sm:p-6">
            <h2 className="font-bold text-lg sm:text-xl mb-4">{t.howToApply}</h2>
            <ol className="space-y-3">
              {steps.map((step, index) => (
                <li key={step} className="flex gap-3 text-sm text-[var(--text-sec)]">
                  <span className="catalog-step-num shrink-0">{index + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </section>

          {displayGame && (
            <button
              type="button"
              onClick={() => navigate(`/game/${displayGame.slug || displayGame.id}`)}
              className="btn btn-secondary w-full sm:w-auto inline-flex items-center justify-center gap-2 touch-manipulation"
            >
              <List className="w-4 h-4" />
              {t.viewAllPacks}
            </button>
          )}
        </div>
      </div>

      <MobileBuyBar>
        <div className="catalog-mobile-buybar" role="region" aria-label={t.buyNow}>
          <div className="catalog-mobile-buybar__inner">
            <div className="min-w-0 flex-1">
              <div className="catalog-mobile-buybar__title truncate">{offerName}</div>
              {isAdmin ? (
                <AdminInlinePriceEdit
                  offer={offer}
                  t={t}
                  size="sm"
                  className="catalog-mobile-buybar__price"
                  onSaved={onPricingSaved}
                  onNotify={onNotify}
                />
              ) : (
                <div className="catalog-mobile-buybar__price tabular-nums" dir="ltr">
                  ${Number.parseFloat(offer.price).toFixed(2)}
                </div>
              )}
              {isAdmin && <AdminOfferCostBadge offer={offer} t={t} className="mt-0.5" />}
            </div>
            <button
              type="button"
              onClick={() => onBuyNow?.(offer)}
              className="btn btn-primary catalog-mobile-buybar__btn font-bold shrink-0 touch-manipulation"
            >
              {isAdmin ? t.giftOffer : t.buyNow}
            </button>
          </div>
        </div>
      </MobileBuyBar>

      {isAdmin && editingOffer && (
        <AdminOfferEditModal
          offer={offer}
          games={games}
          offers={offers}
          lang={lang}
          t={t}
          onClose={() => setEditingOffer(false)}
          onSave={updateProduct}
          onPricingSaved={onPricingSaved}
        />
      )}
      {isAdmin && editingGame && game && (
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
    </CatalogPageShell>
  );
}