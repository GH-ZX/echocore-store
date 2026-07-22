import { ShoppingCart, Zap, Globe, Package } from 'lucide-react';
import AdminOfferCostBadge from '../admin/AdminOfferCostBadge';
import AdminInlinePriceEdit from '../admin/AdminInlinePriceEdit';
import { formatPrice, getOfferDiscount, getOfferDisplayName } from '../../lib/offerDisplay';
import PartnerPriceBadge from '../ui/PartnerPriceBadge';

export default function OfferPurchasePanel({
  offer,
  game,
  games = [],
  catalogOffers = [],
  t = {},
  lang = 'ar',
  isAdmin = false,
  onBuyNow,
  onAddToCart,
  onPricingSaved,
  onNotify,
  className = '',
}) {
  const discount = getOfferDiscount(offer);
  const packLabel = getOfferDisplayName(offer, lang, {
    game,
    games,
    relatedOffers: catalogOffers,
  });

  return (
    <aside className={`catalog-purchase-panel card p-5 sm:p-6 h-fit ${className}`}>
      <div className="space-y-5">
        <div>
          <div className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-1">{t.price}</div>
          {offer.is_sale && offer.original_price && !offer._partnerPriced && !offer._influencerPriced && (
            <div className="text-sm line-through text-[var(--text-muted)]">${formatPrice(offer.original_price)}</div>
          )}
          {(offer._partnerPriced || offer._influencerPriced) && offer._publicPrice != null && (
            <div className="text-sm line-through text-[var(--text-muted)] font-mono tabular-nums" dir="ltr">
              ${formatPrice(offer._publicPrice)}
            </div>
          )}
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin ? (
              <AdminInlinePriceEdit
                offer={offer}
                t={t}
                size="lg"
                onSaved={onPricingSaved}
                onNotify={onNotify}
              />
            ) : (
              <div className="text-4xl sm:text-5xl font-black text-[var(--accent)] tabular-nums" dir="ltr">
                ${formatPrice(offer.price)}
              </div>
            )}
            {offer.is_sale && !offer._partnerPriced && !offer._influencerPriced && (
              <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/15 text-red-300 border border-red-500/25 font-bold">
                {discount ? `-${discount}%` : t.sale}
              </span>
            )}
          </div>
          {!isAdmin && (offer._partnerPriced || offer._influencerPriced) && (
            <div className="mt-2">
              <PartnerPriceBadge offer={offer} t={t} size="lg" />
            </div>
          )}
          {isAdmin && <AdminOfferCostBadge offer={offer} t={t} size="md" className="mt-1" />}
        </div>

        {(offer.amount || packLabel) && (
          <div className="catalog-purchase-panel__meta">
            <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
              <Package className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>{t.youReceive}: <strong className="text-[var(--text-primary)] offer-pack-label">{packLabel}</strong></span>
            </div>
          </div>
        )}

        {(offer.region || game?.region_label) && (
          <div className="catalog-purchase-panel__meta">
            <div className="flex items-center gap-2 text-sm text-[var(--text-sec)]">
              <Globe className="w-4 h-4 text-[var(--accent)] shrink-0" />
              <span>{t.region}: <strong>{offer.region || game.region_label}</strong></span>
            </div>
          </div>
        )}

        

        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2.5 text-xs text-emerald-200/90 flex items-start gap-2">
          <Zap className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t.instantDeliveryNote}</span>
        </div>

        <div className="hidden lg:flex flex-col gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => onBuyNow?.(offer)}
            className="btn btn-primary w-full py-3.5 sm:py-4 text-base font-black touch-manipulation"
          >
            {t.buyNow}
          </button>
          <button
            type="button"
            onClick={(e) => onAddToCart?.(offer, e)}
            className="btn btn-secondary w-full py-3 text-sm inline-flex items-center justify-center gap-2 touch-manipulation"
          >
            <ShoppingCart className="w-4 h-4" />
            {t.addToCart}
          </button>
        </div>
      </div>
    </aside>
  );
}