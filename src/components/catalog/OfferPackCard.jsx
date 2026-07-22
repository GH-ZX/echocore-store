import { Gift, ShoppingCart } from 'lucide-react';
import AdminEditButton from '../admin/AdminEditButton';
import AdminOfferCostBadge from '../admin/AdminOfferCostBadge';
import AdminInlinePriceEdit from '../admin/AdminInlinePriceEdit';
import OfferPackLabel from '../ui/OfferPackLabel';
import {
  formatPrice,
  getOfferDiscount,
  getOfferDisplayName,
  getOfferPackAmount,
} from '../../lib/offerDisplay';

export default function OfferPackCard({
  offer,
  game,
  catalogGames = [],
  catalogOffers = [],
  lang = 'ar',
  t = {},
  regionLabel,
  isAdmin = false,
  onSelect,
  onBuyNow,
  onAddToCart,
  onGift,
  onEdit,
  onPricingSaved,
  onNotify,
}) {
  const showGift = isAdmin && onGift;
  const offerName = getOfferDisplayName(offer, lang, {
    game,
    games: catalogGames,
    relatedOffers: catalogOffers,
  });
  const discount = getOfferDiscount(offer);
  const price = formatPrice(offer.price);

  return (
    <article
      className="catalog-offer-card card group cursor-pointer touch-manipulation active:scale-[0.99] transition-transform"
      onClick={() => onSelect?.(offer)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(offer);
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="catalog-offer-card__body p-4 sm:p-5 flex flex-col h-full">
        {/* Name on start side, pencil/logo on end — opposite ends in AR + EN */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1 pe-1">
            <OfferPackLabel
              as="h3"
              className="font-bold text-base sm:text-lg leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors"
            >
              {offerName}
            </OfferPackLabel>
            {regionLabel && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                {t.region || 'Region'}: {regionLabel}
              </p>
            )}
          </div>
          <div className="flex items-start gap-2 shrink-0">
            {game?.logo_url && (
              <img src={game.logo_url} alt="" className="w-8 h-8 object-contain opacity-80" />
            )}
            {isAdmin && onEdit && (
              <div onClick={(e) => e.stopPropagation()}>
                <AdminEditButton iconOnly label={t.edit || 'Edit'} onClick={() => onEdit(offer)} />
              </div>
            )}
          </div>
        </div>

        {(offer.amount || getOfferPackAmount(offer)) && (
          <p className="text-xs text-[var(--text-sec)] mb-3">
            {t.youReceive || 'You receive'}:{' '}
            <OfferPackLabel className="font-semibold text-[var(--text-primary)]">{offerName}</OfferPackLabel>
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-[var(--border)] flex items-end justify-between gap-3">
          <div>
            {offer.is_sale && offer.original_price && (
              <div className="text-xs line-through text-[var(--text-muted)]">${formatPrice(offer.original_price)}</div>
            )}
            <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
              {isAdmin ? (
                <AdminInlinePriceEdit
                  offer={offer}
                  t={t}
                  size="sm"
                  onSaved={onPricingSaved}
                  onNotify={onNotify}
                />
              ) : (
                <span className="text-2xl font-black text-[var(--accent)] tabular-nums" dir="ltr">${price}</span>
              )}
              {offer.is_sale && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25 font-bold">
                  {discount ? `-${discount}%` : (t.sale || 'SALE')}
                </span>
              )}
            </div>
            {isAdmin && <AdminOfferCostBadge offer={offer} t={t} className="mt-1" />}
          </div>
          {showGift ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onGift(offer);
              }}
              className="btn btn-primary text-xs px-3 py-2 min-h-[40px] shrink-0 inline-flex items-center gap-1.5 bg-gradient-to-r from-pink-600 to-violet-600 border-pink-500/40"
            >
              <Gift className="w-3.5 h-3.5" />
              {t.giftOffer}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 shrink-0">
              {onAddToCart && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToCart(offer, e);
                  }}
                  className="btn btn-secondary p-2 min-h-[40px] min-w-[40px] inline-flex items-center justify-center"
                  title={t.addToCart}
                  aria-label={t.addToCart}
                >
                  <ShoppingCart className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onBuyNow?.(offer);
                }}
                className="btn btn-primary text-xs px-3 py-2 min-h-[40px]"
              >
                {t.buyNow || 'Buy'}
              </button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}