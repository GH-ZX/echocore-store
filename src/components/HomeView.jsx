import { useMemo, useRef } from 'react';
import ProductCarousel from './ProductCarousel';
import SaleOfferCard from './SaleOfferCard';
import HomeGameCard from './HomeGameCard';
import CustomerReviewsSection from './CustomerReviewsSection';
import AdminAddCard from './AdminAddCard';
import { getCarouselGames } from '../lib/carouselUtils';
import { pickStableOffers } from '../lib/customerReviews';
import { DEFAULT_HOME_LAYOUT, getSectionLabel, normalizeHomeLayout } from '../lib/homeLayout';

function buildOfferPoolKey(offers = []) {
  return offers.map((offer) => offer.id).sort().join('|');
}

function buildSuggestedSectionsKey(sections = []) {
  return sections
    .filter((section) => section.type === 'suggested_offers')
    .map((section) => `${section.id}:${section.enabled ? 1 : 0}:${section.limit ?? 8}`)
    .join('|');
}

function pickSaleOffers(offers, limit = 8) {
  const cap = Math.max(1, Math.min(10, Number(limit) || 8));
  return [...offers]
    .filter((offer) => offer.is_sale)
    .sort((a, b) => parseFloat(a.price) - parseFloat(b.price))
    .slice(0, cap);
}

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
  onAddGame,
  onAddOffer,
  onManageCarousel,
  onMoveCarouselGame,
  onBuyNow,
  isAdmin = false,
  searchQuery = '',
  onSearchChange,
  homeLayout = DEFAULT_HOME_LAYOUT,
  reviews = [],
  user = null,
  onReviewSubmitted,
}) {
  const sessionSeedRef = useRef(`home-${Date.now()}`);

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

  const layout = useMemo(() => normalizeHomeLayout(homeLayout), [homeLayout]);

  const offersWithGames = useMemo(
    () => offers.filter((offer) => games.some((game) => game.id === offer.game_id)),
    [offers, games],
  );

  const offerPoolKey = useMemo(() => buildOfferPoolKey(offersWithGames), [offersWithGames]);
  const suggestedSectionsKey = useMemo(() => buildSuggestedSectionsKey(layout), [layout]);

  const suggestedOffersMap = useMemo(() => {
    const map = new Map();
    layout.forEach((section) => {
      if (section.type === 'suggested_offers' && section.enabled) {
        map.set(
          section.id,
          pickStableOffers(
            offersWithGames,
            section.limit ?? 8,
            `${sessionSeedRef.current}:${section.id}:${offerPoolKey}`,
          ),
        );
      }
    });
    return map;
  }, [layout, offerPoolKey, suggestedSectionsKey, offersWithGames]);

  const saleOffersMap = useMemo(() => {
    const map = new Map();
    layout.forEach((section) => {
      if (section.type === 'sale_offers' && section.enabled) {
        map.set(section.id, pickSaleOffers(offersWithGames, section.limit ?? 8));
      }
    });
    return map;
  }, [layout, offersWithGames]);

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
    const titleClass = isGamesStyle ? 'games-section-title' : 'sale-offers-title';
    const dividerClass = isGamesStyle ? 'games-section-divider' : 'sale-offers-divider';

    return (
      <div className={`text-center ${isGamesStyle ? 'mb-6' : 'mb-5'}`}>
        <h2 className="section-heading mb-2">
          <span className={`${titleClass} text-xl md:text-2xl font-bold`}>{title}</span>
        </h2>
        <div className={`${dividerClass} h-px w-10 mx-auto`} />
      </div>
    );
  };

  const renderGamesGrid = (items, section, addOptions = {}) => {
    const showAddCard = isAdmin && onAddGame;
    const hasItems = items.length > 0;

    if (!hasItems && !showAddCard && !loading) {
      return (
        <div className="games-section">
          {section && renderSectionHeading(section, 'games')}
          <div className="text-center py-10 text-[var(--text-sec)]">
            {searchQuery.trim()
              ? (t.noResults || 'No games match your search.')
              : (t.noGamesAvailable || 'No games available yet.')}
          </div>
        </div>
      );
    }

    return (
      <div className="games-section">
        {section && renderSectionHeading(section, 'games')}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="card h-48 sm:h-52 animate-pulse bg-[var(--bg-surface)]" />
            ))}
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
            {showAddCard && (
              <AdminAddCard
                variant="game"
                ariaLabel={t.addGame || (lang === 'ar' ? 'إضافة لعبة' : 'Add game')}
                onClick={() => onAddGame(addOptions)}
              />
            )}
          </div>
        )}
      </div>
    );
  };

  const renderOfferCards = (items, section, addOptions = {}) => {
    const showAddCard = isAdmin && onAddOffer;
    const hasItems = items.length > 0;

    if (!hasItems && !showAddCard) return null;

    const isSaleSection = addOptions.isSale ?? section?.type === 'sale_offers';

    return (
      <div className="sale-offers-section">
        {renderSectionHeading(section, 'sale')}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 items-stretch">
          {items.map((offer) => {
            const game = games.find((g) => g.id === offer.game_id);
            if (!game) return null;

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
                className="w-full min-w-0"
              />
            );
          })}
          {showAddCard && (
            <AdminAddCard
              variant="offer"
              className="w-full min-w-0"
              ariaLabel={
                isSaleSection
                  ? (t.addSaleOffer || (lang === 'ar' ? 'إضافة عرض خصم' : 'Add sale offer'))
                  : (t.addOffer || (lang === 'ar' ? 'إضافة عرض' : 'Add offer'))
              }
              onClick={() => onAddOffer({ isSale: isSaleSection })}
            />
          )}
        </div>
      </div>
    );
  };

  const renderSection = (section) => {
    if (!section.enabled) return null;

    switch (section.type) {
      case 'carousel': {
        if (carouselGames.length === 0 && !(isAdmin && onAddGame)) return null;
        return (
          <ProductCarousel
            key={section.id}
            products={carouselItems}
            t={t}
            lang={lang}
            isAdmin={isAdmin}
            onManageCarousel={onManageCarousel}
            onAddGame={onAddGame}
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
        const saleItems = saleOffersMap.get(section.id) || [];
        return renderOfferCards(saleItems, section, { isSale: true });
      }

      case 'offer_picks': {
        const picked = (section.offer_ids || [])
          .map((id) => offersWithGames.find((offer) => offer.id === id))
          .filter(Boolean)
          .slice(0, section.limit ?? 8);
        return renderOfferCards(picked, section, { isSale: false });
      }

      case 'suggested_offers': {
        const pickedItems = suggestedOffersMap.get(section.id) || [];
        return renderOfferCards(pickedItems, section, { isSale: false });
      }

      case 'customer_reviews': {
        return (
          <CustomerReviewsSection
            key={section.id}
            section={section}
            reviews={reviews}
            lang={lang}
            t={t}
            user={user}
            onReviewSubmitted={onReviewSubmitted}
          />
        );
      }

      case 'games': {
        const gamesSection = {
          ...section,
          title_en: searchQuery.trim() ? (t.searchResults || 'Search Results') : (section.title_en || t.chooseGame || 'Choose a Game'),
          title_ar: searchQuery.trim() ? (t.searchResults || 'نتائج البحث') : (section.title_ar || t.chooseGame || 'اختر لعبتك'),
        };
        return renderGamesGrid(filteredGames, gamesSection, {});
      }

      case 'game_picks': {
        const picked = (section.game_ids || [])
          .map((id) => games.find((game) => game.id === id))
          .filter(Boolean);
        if (picked.length === 0 && !(isAdmin && onAddGame)) return null;
        return renderGamesGrid(picked, section, {});
      }

      default:
        return null;
    }
  };

  return (
    <div className="space-y-10 sm:space-y-14 md:space-y-16 animate-fade-in">
      {layout.map((section) => (
        <div key={section.id}>{renderSection(section)}</div>
      ))}
    </div>
  );
}