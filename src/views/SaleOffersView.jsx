import React from 'react';
import SaleOfferCard from '../components/ui/SaleOfferCard';
import { getDisplayGameForOffer } from '../lib/gameRegions';
import { getSaleOffers } from '../lib/saleOffers';

export default function SaleOffersView({
  games = [],
  offers = [],
  t = {},
  lang = 'en',
  onSelectOffer,
  onBuyNow,
  onEditOffer,
  isAdmin = false,
}) {
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

      {saleOffers.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <div className="text-2xl mb-2">🔥</div>
          <p className="text-[var(--text-sec)]">
            {t.noSaleOffers}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
                onEditOffer={onEditOffer}
                isAdmin={isAdmin}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}