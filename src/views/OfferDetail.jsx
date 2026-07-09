import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AdminEditButton from '../components/admin/AdminEditButton';
import { brandUserText } from '../lib/branding';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';
import { resolveOfferRoute } from '../lib/offerRoutes';
import { presetImageUrl } from '../lib/imageUtils';

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
          <p className="text-[var(--text-sec)]">{t.loadingOffer || (lang === 'ar' ? 'جاري تحميل العرض...' : 'Loading offer...')}</p>
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

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
        <button
          onClick={() => (displayGame ? navigate(`/game/${displayGame.slug || displayGame.id}`) : navigate('/'))}
          className="btn btn-secondary text-sm sm:text-base"
        >
          ← Back to {displayGame ? brandUserText(lang === 'ar' ? displayGame.name_ar : displayGame.name_en) : 'Game'}
        </button>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <AdminEditButton label={t.editOffer || 'Edit Offer'} onClick={() => setEditingOffer(true)} />
            {game && (
              <AdminEditButton label={t.editGame || 'Edit Game'} onClick={() => setEditingGame(true)} />
            )}
          </div>
        )}
      </div>

      <div className="card overflow-hidden mb-8">
        <div className="relative h-64 md:h-80">
          {(offer.sale_image_url || offer.image_url) ? (
            <img
              src={presetImageUrl(offer.sale_image_url || offer.image_url, 'heroCover')}
              alt={lang === 'ar' ? offer.name_ar : offer.name_en}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : game?.image_url && (
            <img
              src={presetImageUrl(game.image_url, 'heroCover')}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
          <div className="absolute bottom-0 p-8 w-full">
            <div className="text-sm opacity-75 mb-1">
              {game ? brandUserText(lang === 'ar' ? game.name_ar : game.name_en) : ''}
            </div>
            <h1 className="text-4xl font-black">
              {brandUserText(lang === 'ar' ? offer.name_ar : offer.name_en)}
            </h1>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Details */}
        <div className="md:col-span-1 card p-6 h-fit">
          <div>
            <div className="text-[var(--text-sec)] text-sm">{t.price}</div>
            {offer.is_sale && offer.original_price ? (
              <>
                <div className="text-sm line-through text-[var(--text-sec)]">${parseFloat(offer.original_price).toFixed(2)}</div>
                <div className="text-4xl sm:text-5xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
              </>
            ) : (
              <div className="text-4xl sm:text-5xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
            )}
            {offer.is_sale && <div className="text-[10px] mt-1 px-2 py-0.5 bg-red-500/10 text-red-400 rounded inline-block">{t.sale}</div>}
          </div>

          {offer.amount && (
            <div className="mt-6">
              <div className="text-[var(--text-sec)] text-sm">{t.youReceive}</div>
              <div className="text-2xl font-bold">{offer.amount} {game?.points_name || ''}</div>
            </div>
          )}

          {offer.region && (
            <div className="mt-6">
              <div className="text-[var(--text-sec)] text-sm">{t.region}</div>
              <div className="font-medium">{offer.region}</div>
            </div>
          )}
          {Array.isArray(game?.servers) && game.servers.length > 0 && (
            <div className="mt-4">
              <div className="text-[var(--text-sec)] text-sm">{t.availableServers || 'Available Servers'}</div>
              <div className="text-sm">{game.servers.join(', ')}</div>
            </div>
          )}

          <div className="flex flex-col gap-3 mt-6 sm:mt-8">
            <button
              type="button"
              onClick={() => onBuyNow?.(offer)}
              className="btn btn-primary w-full py-3.5 sm:py-4 text-base sm:text-lg font-black"
            >
              {t.buyNow}
            </button>
            <button
              onClick={(e) => addToCart(offer, e)}
              className="btn btn-secondary w-full py-3 text-sm"
            >
              {t.addToCart}
            </button>
          </div>
        </div>

        {/* Description + How to Apply */}
        <div className="md:col-span-2 space-y-8">
          <div className="card p-6">
            <div className="flex items-center justify-between gap-2 mb-4">
              <h3 className="font-bold text-xl">{t.description}</h3>
              {isAdmin && (
                <AdminEditButton
                  label={t.edit || 'Edit'}
                  onClick={() => setEditingOffer(true)}
                />
              )}
            </div>
            <p className="text-[var(--text-sec)] leading-relaxed">
              {brandUserText(lang === 'ar' ? offer.description_ar : offer.description_en || t.instantDeliveryNote)}
            </p>
          </div>

          <div className="card p-6">
            <h3 className="font-bold text-xl mb-4">{t.howToApply}</h3>
            <div className="space-y-3 text-[var(--text-sec)]">
              {game?.slug === 'valorant' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Go to the Valorant store in-game.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Click on the store currency (VP) purchase option.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Choose the matching amount and region.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">4.</span> Use the redeem code or UID we send you after purchase.</div>
                </>
              )}
              {game?.slug === 'league-of-legends' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Log into your Riot account on the official website.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Go to the RP purchase page.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Select the amount and enter the code we provide.</div>
                </>
              )}
              {game?.slug === 'pubg-mobile' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Open PUBG Mobile and go to the Store.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Tap on UC purchase.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Use the redeem code or link the UID we send.</div>
                </>
              )}
              {game?.slug === 'mobile-legends' && (
                <>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">1.</span> Open Mobile Legends: Bang Bang.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">2.</span> Tap your profile icon (top left).</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">3.</span> Go to "Redeem" or provide your User ID + Server ID.</div>
                  <div className="flex gap-3"><span className="font-mono text-[var(--accent)]">4.</span> Enter the code or use the top-up link we send after purchase.</div>
                </>
              )}
              {!['valorant', 'league-of-legends', 'pubg-mobile', 'mobile-legends'].includes(game?.slug) && (
                <div>{t.useCode || (lang === 'ar' ? 'استخدم الكود أو الـ UID الذي نرسله لك بعد الشراء في المتجر داخل اللعبة.' : 'Use the code or UID we send you after purchase in the in-game store.')}</div>
              )}
              <div className="pt-2 text-sm text-[var(--text-muted)]">{t.instantDeliveryNote}</div>
            </div>
          </div>
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
        />
      )}
    </div>
  );
}
