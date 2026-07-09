import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2, List } from 'lucide-react';
import AdminEditButton from '../components/admin/AdminEditButton';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';
import CatalogHero from '../components/catalog/CatalogHero';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import OfferPurchasePanel from '../components/catalog/OfferPurchasePanel';
import { brandUserText } from '../lib/branding';
import {
  getGameDisplayName,
  getOfferDisplayName,
  getRedemptionSteps,
} from '../lib/offerDisplay';
import { resolveOfferRoute } from '../lib/offerRoutes';
import { buildGameBreadcrumb } from '../lib/catalogNav';

export default function OfferDetail({
  games,
  offers,
  t = {},
  lang,
  navigate,
  addToCart,
  user,
  updateProduct,
  updateGame,
  deleteGame,
  loadingCatalog = false,
  onBuyNow,
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

  const gameName = displayGame ? getGameDisplayName(displayGame, lang) : '';
  const offerName = getOfferDisplayName(offer, lang);
  const description = brandUserText(
    (lang === 'ar' ? offer.description_ar : offer.description_en) || t.instantDeliveryNote,
  );
  const steps = getRedemptionSteps(game, t, lang);
  const heroImage = offer.sale_image_url || offer.image_url || displayGame?.image_url;
  const catalogTrail = displayGame
    ? buildGameBreadcrumb(displayGame, t, lang, navigate, { offerName })
    : null;

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
        subtitle={gameName}
        meta={offer.region || game?.region_label || null}
        badges={offer.is_sale ? [{ label: t.sale, className: 'border-red-400/30 bg-red-500/15 text-red-200' }] : []}
      />

      <div className="catalog-detail-layout grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] gap-6 lg:gap-8 items-start">
        <OfferPurchasePanel
          offer={offer}
          game={game}
          t={t}
          lang={lang}
          onBuyNow={onBuyNow}
          onAddToCart={addToCart}
          className="order-1 lg:order-2 lg:sticky lg:top-24"
        />

        <div className="space-y-5 sm:space-y-6 min-w-0 order-2 lg:order-1">
          <section className="card p-5 sm:p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h2 className="font-bold text-lg sm:text-xl">{t.description}</h2>
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
            <p className="text-xs text-[var(--text-muted)] mt-4 pt-4 border-t border-[var(--border)]">
              {t.instantDeliveryNote}
            </p>
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

      <div className="catalog-mobile-buybar lg:hidden fixed inset-x-0 bottom-0 z-40 border-t border-[var(--border)] bg-[var(--bg-surface)]/95 backdrop-blur-md px-4 py-3 safe-area-pb">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] text-[var(--text-muted)] uppercase tracking-wide truncate">{offerName}</div>
            <div className="text-xl font-black text-[var(--accent)]">${Number.parseFloat(offer.price).toFixed(2)}</div>
          </div>
          <button
            type="button"
            onClick={() => onBuyNow?.(offer)}
            className="btn btn-primary px-5 py-3 font-bold shrink-0 touch-manipulation"
          >
            {t.buyNow}
          </button>
        </div>
      </div>

      {isAdmin && editingOffer && (
        <AdminOfferEditModal
          offer={offer}
          games={games}
          lang={lang}
          t={t}
          onClose={() => setEditingOffer(false)}
          onSave={updateProduct}
        />
      )}
      {isAdmin && editingGame && game && (
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
    </CatalogPageShell>
  );
}