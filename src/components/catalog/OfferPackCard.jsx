import AdminEditButton from '../admin/AdminEditButton';
import { formatPrice, getOfferDiscount, getOfferDisplayName } from '../../lib/offerDisplay';

export default function OfferPackCard({
  offer,
  game,
  lang = 'ar',
  t = {},
  regionLabel,
  isAdmin = false,
  onSelect,
  onBuyNow,
  onEdit,
}) {
  const offerName = getOfferDisplayName(offer, lang);
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
      <div className="catalog-offer-card__body p-4 sm:p-5 flex flex-col h-full relative">
        {isAdmin && onEdit && (
          <div className="absolute top-3 end-3 z-10" onClick={(e) => e.stopPropagation()}>
            <AdminEditButton iconOnly label={t.edit || 'Edit'} onClick={() => onEdit(offer)} />
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-base sm:text-lg leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
              {offerName}
            </h3>
            {regionLabel && (
              <p className="text-[11px] text-[var(--text-muted)] mt-1">
                {t.region || 'Region'}: {regionLabel}
              </p>
            )}
          </div>
          {game?.logo_url && (
            <img src={game.logo_url} alt="" className="w-8 h-8 object-contain shrink-0 opacity-80" />
          )}
        </div>

        {offer.amount && (
          <p className="text-xs text-[var(--text-sec)] mb-3">
            {t.youReceive || 'You receive'}: <span className="font-semibold text-[var(--text-primary)]">{offer.amount} {game?.points_name || ''}</span>
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-[var(--border)] flex items-end justify-between gap-3">
          <div>
            {offer.is_sale && offer.original_price && (
              <div className="text-xs line-through text-[var(--text-muted)]">${formatPrice(offer.original_price)}</div>
            )}
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black text-[var(--accent)]">${price}</span>
              {offer.is_sale && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25 font-bold">
                  {discount ? `-${discount}%` : (t.sale || 'SALE')}
                </span>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBuyNow?.(offer);
            }}
            className="btn btn-primary text-xs px-3 py-2 min-h-[40px] shrink-0"
          >
            {t.buyNow || 'Buy'}
          </button>
        </div>
      </div>
    </article>
  );
}