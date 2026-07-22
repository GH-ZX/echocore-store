import { useEffect, useMemo, useState } from 'react';
import SaleOfferCard from '../components/ui/SaleOfferCard';
import { getDisplayGameForOffer, offerBelongsToStorefront } from '../lib/gameRegions';
import { pickTopBoughtOffers } from '../lib/customerReviews';
import { fetchBestsellingOfferRanks } from '../lib/bestsellingOffers';

const PAGE_LIMIT = 50;

export default function SuggestedOffersView({
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
  const [ranks, setRanks] = useState([]);
  const [loadingRanks, setLoadingRanks] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoadingRanks(true);
    fetchBestsellingOfferRanks(PAGE_LIMIT).then((rows) => {
      if (!cancelled) {
        setRanks(Array.isArray(rows) ? rows : []);
        setLoadingRanks(false);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const pool = useMemo(
    () => (offers || []).filter((offer) => offerBelongsToStorefront(offer, games)),
    [offers, games],
  );

  const suggested = useMemo(
    () => pickTopBoughtOffers(pool, ranks, PAGE_LIMIT).filter((offer) => (
      !!getDisplayGameForOffer(offer, games)
    )),
    [pool, ranks, games],
  );

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 sm:mb-8">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-2">
          <h1 className="sale-offers-page-title text-2xl sm:text-3xl md:text-4xl font-black">
            {t.suggestedOffersPageTitle || t.suggestedOffers || 'Suggested offers'}
          </h1>
          <span className="sale-offers-deals-pill px-3 py-1 text-xs font-bold rounded-full">
            {t.mostBought || 'Top sellers'}
          </span>
        </div>
        <p className="text-sm sm:text-base text-[var(--text-secondary)]">
          {t.suggestedOffersPageDesc || t.bestDiscounts}
        </p>
      </div>

      {loadingRanks && suggested.length === 0 ? (
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 animate-pulse">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card h-[320px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl" />
          ))}
        </div>
      ) : suggested.length === 0 ? (
        <div className="card p-8 sm:p-12 text-center">
          <div className="text-2xl mb-2">✨</div>
          <p className="text-[var(--text-sec)]">
            {t.noSuggestedOffers || t.noSaleOffers}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {suggested.map((offer) => {
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
        </div>
      )}
    </div>
  );
}
