import React from 'react';
import AdminEditButton from '../admin/AdminEditButton';
import AdminOfferCostBadge from '../admin/AdminOfferCostBadge';
import BorderGlow from './BorderGlow';
import { getOfferDisplayName } from '../../lib/offerDisplay';
import { getOfferDiscount } from '../../lib/saleOffers';
import { getFulfillmentGameForOffer } from '../../lib/gameRegions';
import OfferPackLabel from './OfferPackLabel';
import { presetImageUrl } from '../../lib/imageUtils';
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
  onEditOffer,
  isAdmin = false,
  className = '',
}) {
  if (!offer || !game) return null;

  const isAr = lang === 'ar';
  const gameName = isAr ? game.name_ar : game.name_en;
  const fulfillmentGame = getFulfillmentGameForOffer(offer, games) || game;
  const offerName = getOfferDisplayName(offer, lang, { game: fulfillmentGame, games, relatedOffers: offers });
  const price = parseFloat(offer.price).toFixed(2);
  const originalPrice = offer.original_price ? parseFloat(offer.original_price).toFixed(2) : null;
  const discount = getOfferDiscount(offer);
  const showSale = offer.is_sale && discount != null && discount > 0;

  const gameCardImage = getGameCardImageUrl(game);
  const saleCardImage = offer.sale_image_url || gameCardImage;

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
    <div
      onClick={() => onSelectOffer?.(offer)}
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
            <span className="sale-offer-badge px-2 py-0.5 text-[10px] font-bold rounded-md shadow-sm">
              {t.sale || 'SALE'}
            </span>
          )}
          {showSale && (
            <span className="sale-offer-discount px-2 py-0.5 bg-black/50 backdrop-blur-sm text-[10px] font-bold rounded-md border">
              -{discount}%
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
            {showSale && originalPrice && (
              <span className="text-xs sm:text-sm line-through text-[var(--text-muted)]">
                ${originalPrice}
              </span>
            )}
            <span className="text-lg sm:text-xl font-black text-[var(--accent)]">
              ${price}
            </span>
          </div>
          {isAdmin && <AdminOfferCostBadge offer={offer} t={t} />}
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectOffer?.(offer);
            }}
            className="flex-1 btn btn-secondary text-[11px] sm:text-xs py-2 px-2 min-w-0"
          >
            {t.details}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onBuyNow?.(offer);
            }}
            className="flex-1 btn btn-primary text-[11px] sm:text-xs py-2 px-2 font-semibold min-w-0"
          >
            {t.buy}
          </button>
        </div>
      </div>
    </div>
    </BorderGlow>
  );
}