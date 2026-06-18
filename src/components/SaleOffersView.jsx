import React from 'react';

export default function SaleOffersView({ 
  games = [], 
  offers = [], 
  t = {}, 
  lang = 'en', 
  onSelectOffer,
  addToCart 
}) {
  const isAr = lang === 'ar';

  // Only sale offers
  const saleOffers = offers
    .filter(o => o.is_sale)
    .sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <h1 className="text-3xl md:text-4xl font-black">
            {isAr ? t.saleOffers || 'عروض الخصم' : t.saleOffers || 'Sale Offers'}
          </h1>
          <span className="px-3 py-1 text-xs font-bold bg-red-500/20 text-red-400 rounded-full">
            {isAr ? t.deals || 'خصومات' : t.deals || 'DEALS'}
          </span>
        </div>
        <p className="text-[var(--text-secondary)]">
          {isAr 
            ? t.bestDiscounts || 'أفضل العروض والخصومات على شحن الألعاب' 
            : t.bestDiscounts || 'Best discounts and deals on game top-ups'}
        </p>
      </div>

      {saleOffers.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="text-2xl mb-2">🔥</div>
          <p className="text-[var(--text-sec)]">
            {isAr ? t.noSaleOffers || 'لا توجد عروض خصم حالياً. تحقق لاحقاً!' : t.noSaleOffers || 'No sale offers right now. Check back later!'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {saleOffers.map((offer) => {
            const game = games.find(g => g.id === offer.game_id);
            if (!game) return null;

            return (
              <div
                key={offer.id}
                onClick={() => onSelectOffer && onSelectOffer(offer)}
                className="card group overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgb(0,0,0)] active:scale-[0.985]"
              >
                <div className="relative h-48 sm:h-52">
                  {(offer.sale_image_url || game.image_url) ? (
                    <img 
                      src={offer.sale_image_url || game.image_url} 
                      alt={game.name_en} 
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
                  )}
                  <div className="absolute inset-0 bg-black/25" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute top-3 right-3">
                    <span className="px-2 py-0.5 bg-red-500/90 text-white text-[10px] font-bold rounded">SALE</span>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-3">
                    <div className="text-xs text-white/70 mb-0.5">{game.name_en}</div>
                    <div className="font-semibold text-sm text-white mb-1 line-clamp-1">{offer.name_en}</div>
                    <div className="flex items-baseline gap-2">
                      {offer.is_sale && offer.original_price ? (
                        <>
                          <div className="text-sm line-through text-white/60">${parseFloat(offer.original_price).toFixed(2)}</div>
                          <div className="text-xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                        </>
                      ) : (
                        <div className="text-xl font-black text-[var(--accent)]">${parseFloat(offer.price).toFixed(2)}</div>
                      )}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); onSelectOffer && onSelectOffer(offer); }}
                        className="flex-1 btn btn-secondary text-xs py-1.5"
                      >
                        {isAr ? 'التفاصيل' : 'Details'}
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); window.location.href = `/buy/${offer.id}`; }}
                        className="flex-1 btn btn-primary text-xs py-1.5 font-semibold"
                      >
                        {isAr ? 'اشترِ الآن' : 'Buy Now'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
