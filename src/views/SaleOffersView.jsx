import React from 'react';
import { Tags } from 'lucide-react';
import SaleOfferCard from '../components/ui/SaleOfferCard';
import CatalogGrid from '../components/catalog/CatalogGrid';
import { getDisplayGameForOffer } from '../lib/gameRegions';
import { getSaleOffers } from '../lib/saleOffers';

export default function SaleOffersView({
  games = [],
  offers = [],
  t = {},
  lang = 'en',
  onSelectOffer,
  onBuyNow,
  onAddToCart,
  addToCart,
  onEditOffer,
  isAdmin = false,
}) {
  const handleAddToCart = onAddToCart || addToCart;
  const saleOffers = getSaleOffers(offers);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <h1 className="sale-offers-page-title text-2xl sm:text-3xl md:text-4xl font-black">
            {t.saleOffers}
          </h1>
          <span className="sale-offers-deals-pill px-3 py-1 text-xs font-bold rounded-full">
            {t.deals}
          </span>
        </div>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">
          {t.bestDiscounts}
        </p>
      </div>

      <CatalogGrid count={saleOffers.length} emptyTitle={t.noSaleOffers} emptyIcon={Tags} variant="offers">
        {saleOffers.map((offer) => {
          const game = getDisplayGameForOffer(offer, games);
          return (
            <SaleOfferCard
              key={offer.id}
              offer={offer}
              game={game}
              games={games}
              offers={offers}
              t={t}
              lang={lang}
              onSelectOffer={onSelectOffer}
              onBuyNow={onBuyNow}
              onAddToCart={handleAddToCart}
              onEditOffer={onEditOffer}
              isAdmin={isAdmin}
            />
          );
        })}
      </CatalogGrid>
    </div>
  );
}