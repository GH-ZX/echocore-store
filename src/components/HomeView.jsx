
import ProductCarousel from './ProductCarousel';

export default function HomeView({
  t,
  lang,
  games = [],
  loading = false,
  addToCart,
  onSelectGame
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
    category: 'games',
    price: 0
  }));

  return (
    <div className="space-y-12 animate-fade-in">
      {/* CAROUSEL at the top */}
      {games.length > 0 && (
        <ProductCarousel 
          products={carouselItems} 
          lang={lang} 
          onSelectProduct={(item) => onSelectGame && onSelectGame(games.find(g => g.id === item.id))} 
        />
      )}

      {/* Value props */}
      <div className="flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm text-[var(--text-sec)]">
        <div className="flex items-center gap-2">⚡ Instant digital delivery</div>
        <div className="flex items-center gap-2">🔒 Secure payments</div>
        <div className="flex items-center gap-2">🌍 Arabic & English support</div>
      </div>

      {/* GAMES SECTION - below the carousel */}
      <h2 className="text-2xl font-bold text-center">Choose a Game</h2>
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-[200px] animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : games.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-sec)]">
          No games yet. Add games in Supabase.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {games.map((game) => (
            <div
              key={game.id}
              onClick={() => onSelectGame && onSelectGame(game)}
              className="card group overflow-hidden cursor-pointer hover:border-[var(--accent)] transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgb(0,0,0)] active:scale-[0.985]"
            >
              <div className="relative h-40">
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
                  <div className="font-bold text-xl text-white">
                    {lang === 'ar' ? game.name_ar : game.name_en}
                  </div>
                  <div className="text-sm text-white/70 mt-0.5">
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

