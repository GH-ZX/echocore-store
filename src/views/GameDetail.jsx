import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import AdminEditButton from '../components/admin/AdminEditButton';
import BorderGlow from '../components/ui/BorderGlow';
import AdminGameEditModal from '../components/admin/AdminGameEditModal';
import AdminOfferEditModal from '../components/admin/AdminOfferEditModal';

export default function GameDetail({ games, offers, t = {}, lang, navigate, addToCart: _addToCart, user, updateProduct, updateGame, loadingGames = false }) {
  const { slug } = useParams();
  const game = games.find((g) => (g.slug || g.id) === slug) || games.find((g) => g.id === slug);
  const isAdmin = user?.role === 'admin';
  const [editingOffer, setEditingOffer] = useState(null);
  const [editingGame, setEditingGame] = useState(false);

  if (loadingGames || (!game && games.length === 0)) {
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

  if (!game) {
    return (
      <div className="max-w-4xl mx-auto text-center py-20">
        <p className="text-xl text-[var(--text-sec)]">{t.gameNotFound}</p>
        <button onClick={() => navigate('/')} className="btn btn-secondary mt-4">{t.backToHome}</button>
      </div>
    );
  }

  const gameOffers = offers.filter((o) => o.game_id === game.id);

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-4 sm:mb-6 flex flex-wrap items-center justify-between gap-2">
        <button onClick={() => navigate('/')} className="btn btn-secondary text-sm sm:text-base">
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
              src={game.image_url}
              alt={lang === 'ar' ? game.name_ar : game.name_en}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-0 p-6 md:p-8">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black text-white">
              {lang === 'ar' ? game.name_ar : game.name_en}
            </h1>
            <p className="text-white/70 text-lg mt-1">{game.points_name} Top-ups</p>
            <p className="text-white/50 text-sm mt-1">{t.redemptionMethod || 'Redemption'}: {game.redemption_method === 'uid' ? (t.redemptionUid || 'UID') : game.redemption_method === 'redeem_code' ? (t.redemptionCode || 'Redeem Code') : (t.redemptionBoth || 'UID or Redeem Code')}</p>
            {Array.isArray(game.servers) && game.servers.length > 0 && (
              <p className="text-white/40 text-xs mt-0.5">{t.availableServers}: {game.servers.join(' • ')}</p>
            )}
          </div>
        </div>
      </div>

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
              onClick={() => navigate(`/offer/${offer.id}`)}
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
              {/* Game logo + name header */}
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
                  {lang === 'ar' ? game.name_ar : game.name_en}
                </div>
              </div>

              {/* Offer name */}
              <div className="font-bold text-base sm:text-lg leading-tight mb-1 line-clamp-2 flex-1">
                {lang === 'ar' ? offer.name_ar : offer.name_en}
              </div>

              {/* Region */}
              {offer.region && (
                <div className="text-[10px] text-[var(--text-sec)] mb-2.5">
                  {t.region}: {offer.region}
                </div>
              )}

              {/* Price section */}
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

              {/* Actions */}
              <div className="mt-4 flex gap-2">
                <button 
                  onClick={(e) => { e.stopPropagation(); navigate(`/buy/${offer.id}`); }}
                  className="flex-1 btn btn-primary text-xs py-2 font-semibold active:scale-[0.985]"
                >
                  {t.buyNow}
                </button>
                <button 
                  onClick={(e) => { e.stopPropagation(); navigate(`/offer/${offer.id}`); }}
                  className="flex-1 btn btn-secondary text-xs py-2"
                >
                  {t.details || (lang==='ar' ? 'تفاصيل' : 'Details')}
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
