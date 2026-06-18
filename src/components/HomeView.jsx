
import ProductCarousel from './ProductCarousel';

export default function HomeView({
  t = {},
  lang,
  games = [],
  offers = [],
  loading = false,
  addToCart,
  onSelectGame,
  onSelectOffer,
  searchQuery = '',
  onSearchChange
}) {
  // Format games for the carousel
  // Main slide uses full cover (image_url)
  // Bottom strip MUST use dedicated logo (not full photo)
  const getLocalLogo = (slug) => {
    if (!slug) return null;
    const s = slug.toLowerCase();
    try {
      if (s.includes('valorant')) return new URL('../assets/valorant-logo.png', import.meta.url).href;
      if (s.includes('league') || s.includes('lol')) return new URL('../assets/lol-logo.png', import.meta.url).href;
      if (s.includes('xbox')) return new URL('../assets/xbox-logo.png', import.meta.url).href;
    } catch {}
    return null;
  };

  const carouselItems = games.map(g => ({
    id: g.id,
    name_en: g.name_en,
    name_ar: g.name_ar,
    image_url: g.image_url,           // full cover for main big slide
    logo_url: g.logo_url || getLocalLogo(g.slug),  // dedicated logo for bottom strip
    description_en: g.description_en || '',
    description_ar: g.description_ar || '',
    category: 'games',
    price: 0
  }));

  const filteredGames = searchQuery.trim()
    ? games.filter(g =>
        (g.name_en || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (g.name_ar || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : games;

  return (
    <div className="space-y-10 animate-fade-in">
      {/* CAROUSEL at the top */}
      {games.length > 0 && (
        <ProductCarousel 
          products={carouselItems} 
          t={t}
          lang={lang} 
          onSelectProduct={(item) => onSelectGame && onSelectGame(games.find(g => g.id === item.id))} 
        />
      )}

      {/* SALE OFFERS - directly below the carousel */}
      {offers.some(o => o.is_sale) && (
        <div>
          <h2 className="text-center mb-3">
            <span className="text-lg md:text-xl font-semibold tracking-tight text-red-300">{t.saleOffers || 'Sale Offers'}</span>
          </h2>
          <div className="h-px w-8 bg-red-400/60 mx-auto mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {(() => {
              // Prioritize offers with dedicated sale photo, then by price
              const sorted = [...offers].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
              const saleFirst = sorted.filter(o => o.is_sale).slice(0, 4);
              return saleFirst.map((offer) => {
                // Find the game for this offer
                const game = games.find(g => g.id === offer.game_id);
                if (!game) return null;
                return (
                  <div
                    key={offer.id}
                    onClick={() => onSelectOffer && onSelectOffer(offer)}
                    className="card group overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgb(0,0,0)] active:scale-[0.985]"
                  >
                    <div className="relative h-48 sm:h-52">
                      {offer.sale_image_url || game.image_url ? (
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
                          {offer.is_sale && <div className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">SALE</div>}
                        </div>
                        <div className="mt-2 flex gap-2">
                          <button 
                            onClick={(e) => { e.stopPropagation(); onSelectOffer(offer); }}
                            className="flex-1 btn btn-secondary text-xs py-1.5"
                          >
                            {t.details || (lang === 'ar' ? 'تفاصيل' : 'Details')}
                          </button>
                          <button 
                            onClick={(e) => { e.stopPropagation(); window.location.href = `/buy/${offer.id}`; }}
                            className="flex-1 btn btn-primary text-xs py-1.5 font-semibold"
                          >
                            {lang === 'ar' ? 'اشترِ الآن' : 'Buy Now'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* GAMES SECTION - below the carousel */}
      <h2 className="text-center mb-3">
        <span className="text-lg md:text-xl font-semibold tracking-tight text-[var(--text-secondary)]">
          {searchQuery.trim() ? (t.searchResults || 'Search Results') : (t.chooseGame || 'Choose a Game')}
        </span>
      </h2>
      <div className="h-px w-8 bg-[var(--accent)]/50 mx-auto mb-5" />
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-48 sm:h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-sec)]">
          {searchQuery.trim()
            ? (t.noResults || 'No games match your search.')
            : (t.noGamesAvailable || 'No games yet. Make sure your Supabase tables have data and the correct VITE_SUPABASE_URL / ANON_KEY are set in Netlify.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredGames.map((game) => (
            <div
              key={game.id}
              onClick={() => onSelectGame && onSelectGame(game)}
              className="card group overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgb(0,0,0)] active:scale-[0.985]"
            >
              <div className="relative h-48 sm:h-52">
                {game.image_url ? (
                  <img 
                    src={game.image_url} 
                    alt={lang === 'ar' ? game.name_ar : game.name_en} 
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                ) : (
                  <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-4">
                  <div className="font-bold text-lg sm:text-xl text-white">
                    {lang === 'ar' ? game.name_ar : game.name_en}
                  </div>
                  <div className="text-xs sm:text-sm text-white/70 mt-0.5">
                    {game.points_name} top-ups
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

