import React from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
import AdminEditButton from '../admin/AdminEditButton';
import AdminOfferCostBadge from '../admin/AdminOfferCostBadge';
import BorderGlow from './BorderGlow';
import { formatPrice, getOfferDisplayName } from '../../lib/offerDisplay';
import { getGameOfferPath } from '../../lib/offerRoutes';
import { getOfferDiscount } from '../../lib/saleOffers';
import { getFulfillmentGameForOffer } from '../../lib/gameRegions';
import OfferPackLabel from './OfferPackLabel';
import PartnerPriceBadge from './PartnerPriceBadge';
import { presetImageUrl } from '../../lib/imageUtils';
import { formatMoney } from '../../lib/i18n';
import { getGameCardImageUrl } from '../../lib/gameImages';

export default function SaleOfferCard({
  offer,
  game,
  games = [],
  offers = [],
  t = {},
  lang = 'en',
  onSelectOffer,
  onBuyNow,
  onAddToCart,
  onEditOffer,
  isAdmin = false,
  className = '',
}) {
  if (!offer || !game) return null;

  const isAr = lang === 'ar';
  const gameName = isAr ? game.name_ar : game.name_en;
  const fulfillmentGame = getFulfillmentGameForOffer(offer, games) || game;
  const offerName = getOfferDisplayName(offer, lang, { game: fulfillmentGame, games, relatedOffers: offers });
  const price = formatMoney(offer.price);
  const originalPrice = offer.original_price ? formatMoney(offer.original_price) : null;
  const discount = getOfferDiscount(offer);
  const showSale = offer.is_sale && discount != null && discount > 0;

  const gameCardImage = getGameCardImageUrl(game);
  const saleCardImage = offer.sale_image_url || gameCardImage;

  const offerPath = getGameOfferPath(offer, games && games.length ? games : game);

  const handleOpen = (event) => {
    // Let the browser handle new-tab / modified clicks via the real link
    if (event && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    if (onSelectOffer) {
      event?.preventDefault();
      onSelectOffer(offer);
    }
  };

  return (
    <BorderGlow
      edgeSensitivity={25}
      borderRadius={16}
      glowRadius={30}
      glowIntensity={0.8}
      coneSpread={25}
      fillOpacity={0.35}
      className={className}
    >
    <Link
      to={offerPath}
      onClick={handleOpen}
      className="storefront-card sale-offer-card group flex flex-col cursor-pointer transition-all duration-300 active:scale-[0.99]"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] sm:aspect-[4/3] overflow-hidden bg-[var(--bg-elevated)] flex-shrink-0">
        {saleCardImage ? (
          <img
            src={presetImageUrl(saleCardImage, 'cardCover')}
            alt={offerName}
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-primary)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
          <div className="flex items-center gap-1.5">
          {showSale && (
            <span className="sale-offer-badge px-2 py-1 text-[11px] font-bold rounded-md shadow-sm inline-flex items-center gap-1">
              <span>{t.sale || 'SALE'}</span>
              <span className="sale-offer-discount-inline">-{discount}%</span>
            </span>
          )}
          </div>
          {isAdmin && onEditOffer && (
            <AdminEditButton
              iconOnly
              label={t.edit || 'Edit'}
              onClick={() => onEditOffer(offer)}
              className="bg-black/50 backdrop-blur-sm"
            />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="storefront-card__body flex flex-col flex-1 p-3 sm:p-3.5 gap-1.5 min-w-0">
        <p className="text-[11px] sm:text-xs text-[var(--text-muted)] truncate font-medium">
          {gameName}
        </p>
        <OfferPackLabel
          as="h3"
          className="font-semibold text-sm sm:text-base leading-snug text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem]"
        >
          {offerName}
        </OfferPackLabel>

        <div className="mt-auto pt-1 space-y-1">
          <div className="flex items-baseline gap-2 flex-wrap">
            {showSale && originalPrice && !offer._partnerPriced && !offer._influencerPriced && (
              <span className="text-xs sm:text-sm line-through text-[var(--text-muted)]">
                {originalPrice}
              </span>
            )}
            {(offer._partnerPriced || offer._influencerPriced) && offer._publicPrice != null && (
              <span className="text-xs sm:text-sm line-through text-[var(--text-muted)] font-mono" dir="ltr">
                ${formatPrice(offer._publicPrice)}
              </span>
            )}
            <span className="text-lg sm:text-xl font-black text-[var(--price)] tabular-nums" dir="ltr">
              {price}
            </span>
          </div>
          {!isAdmin && (offer._partnerPriced || offer._influencerPriced) && (
            <PartnerPriceBadge offer={offer} t={t} />
          )}
          {isAdmin && <AdminOfferCostBadge offer={offer} t={t} />}
        </div>

        <div className="flex gap-1.5 pt-2">
          {onAddToCart && !isAdmin && (
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onAddToCart(offer, e);
              }}
              className="btn btn-secondary p-2 shrink-0 inline-flex items-center justify-center"
              title={t.addToCart}
              aria-label={t.addToCart}
            >
              <ShoppingCart className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onBuyNow?.(offer);
            }}
            className="flex-1 btn btn-primary text-[11px] sm:text-xs py-2 px-2 font-semibold min-w-0"
          >
            {t.buy}
          </button>
        </div>
      </div>
    </Link>
    </BorderGlow>
  );
}