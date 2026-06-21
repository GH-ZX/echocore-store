import ProductCarousel from './ProductCarousel';
import SaleOfferCard from './SaleOfferCard';
import HomeGameCard from './HomeGameCard';
import { getCarouselGames } from '../lib/carouselUtils';
import { DEFAULT_HOME_LAYOUT, getSectionLabel, normalizeHomeLayout } from '../lib/homeLayout';

export default function HomeView({
  t = {},
  lang,
  games = [],
  offers = [],
  loading = false,
  addToCart,
  onSelectGame,
  onSelectOffer,
  onEditOffer,
  onEditGame,
  onManageCarousel,
  onMoveCarouselGame,
  onBuyNow,
  isAdmin = false,
  searchQuery = '',
  onSearchChange,
  homeLayout = DEFAULT_HOME_LAYOUT,
}) {
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

  const layout = normalizeHomeLayout(homeLayout);
  const carouselGames = getCarouselGames(games);

  const carouselItems = carouselGames.map((g) => ({
    id: g.id,
    name_en: g.name_en,
    name_ar: g.name_ar,
    image_url: g.image_url,
    logo_url: g.logo_url || getLocalLogo(g.slug),
    description_en: g.description_en || '',
    description_ar: g.description_ar || '',
    carousel_focus_x: g.carousel_focus_x ?? 50,
    carousel_focus_y: g.carousel_focus_y ?? 50,
    category: 'games',
    price: 0,
  }));

  const filteredGames = searchQuery.trim()
    ? games.filter((g) =>
        (g.name_en || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (g.name_ar || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : games;

  const renderSectionHeading = (section, style = 'sale') => {
    const title = getSectionLabel(section, lang);
    const isGamesStyle = style === 'games';
    const wrapperClass = isGamesStyle ? 'games-section' : 'sale-offers-section';
    const titleClass = isGamesStyle ? 'games-section-title' : 'sale-offers-title';
    const dividerClass = isGamesStyle ? 'games-section-divider' : 'sale-offers-divider';

    return (
      <>
        <h2 className="text-center mb-3">
          <span className={`${titleClass} text-lg md:text-xl font-semibold tracking-tight`}>{title}</span>
        </h2>
        <div className={`${dividerClass} h-px w-8 mx-auto ${isGamesStyle ? 'mb-5' : 'mb-4'}`} />
      </>
    );
  };

  const renderGamesGrid = (items, section) => (
    <div className={`games-section ${section?.id ? '' : ''}`}>
      {section && renderSectionHeading(section, 'games')}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-48 sm:h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-10 text-[var(--text-sec)]">
          {searchQuery.trim()
            ? (t.noResults || 'No games match your search.')
            : (t.noGamesAvailable || 'No games available yet.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((game) => (
            <HomeGameCard
              key={game.id}
              game={game}
              lang={lang}
              t={t}
              onSelectGame={onSelectGame}
              onEditGame={onEditGame}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}
    </div>
  );

  const renderOfferCards = (items, section) => {
    if (items.length === 0) return null;

    return (
      <div className="sale-offers-section">
        {renderSectionHeading(section, 'sale')}
        <div className="flex sm:grid sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1 -mx-3 px-3 sm:mx-0 sm:px-0 sm:overflow-visible">
          {items.map((offer) => {
            const game = games.find((g) => g.id === offer.game_id);
            return (
              <SaleOfferCard
                key={offer.id}
                offer={offer}
                game={game}
                t={t}
                lang={lang}
                onSelectOffer={onSelectOffer}
                onBuyNow={onBuyNow}
                onEditOffer={onEditOffer}
                isAdmin={isAdmin}
                className="snap-start shrink-0 w-[min(78vw,280px)] sm:w-auto sm:shrink"
              />
            );
          })}
        </div>
      </div>
    );
  };

  const renderSection = (section) => {
    if (!section.enabled) return null;

    switch (section.type) {
      case 'carousel': {
        if (carouselGames.length === 0) return null;
        return (
          <ProductCarousel
            key={section.id}
            products={carouselItems}
            t={t}
            lang={lang}
            isAdmin={isAdmin}
            onManageCarousel={onManageCarousel}
            onEditGame={(item) => {
              const game = games.find((g) => g.id === item.id);
              if (game) onEditGame?.(game);
            }}
            onMoveCarouselGame={onMoveCarouselGame}
            onSelectProduct={(item) => onSelectGame && onSelectGame(games.find((g) => g.id === item.id))}
          />
        );
      }

      case 'sale_offers': {
        const sorted = [...offers].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        const saleItems = sorted.filter((o) => o.is_sale).slice(0, section.limit ?? 4);
        return renderOfferCards(saleItems, section);
      }

      case 'offer_picks': {
        const picked = (section.offer_ids || [])
          .map((id) => offers.find((offer) => offer.id === id))
          .filter(Boolean);
        return renderOfferCards(picked, section);
      }

      case 'games': {
        const gamesSection = {
          ...section,
          title_en: searchQuery.trim() ? (t.searchResults || 'Search Results') : (section.title_en || t.chooseGame || 'Choose a Game'),
          title_ar: searchQuery.trim() ? (t.searchResults || 'نتائج البحث') : (section.title_ar || t.chooseGame || 'اختر لعبتك'),
        };
        return renderGamesGrid(filteredGames, gamesSection);
      }

      case 'game_picks': {
        const picked = (section.game_ids || [])
          .map((id) => games.find((game) => game.id === id))
          .filter(Boolean);
        if (picked.length === 0) return null;
        return renderGamesGrid(picked, section);
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6 sm:space-y-10 animate-fade-in">
      {layout.map((section) => (
        <div key={section.id}>{renderSection(section)}</div>
      ))}
    </div>
  );
}