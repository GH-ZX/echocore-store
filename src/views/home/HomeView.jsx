import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { ChevronDown, Eye, EyeOff } from 'lucide-react';
import ProductCarousel from './ProductCarousel';
import SaleOfferCard from '../../components/ui/SaleOfferCard';
import HomeGameCard from '../../components/ui/HomeGameCard';
import CustomerReviewsSection from './CustomerReviewsSection';
import AdminAddCard from '../../components/admin/AdminAddCard';
import { getCarouselGames } from '../../lib/carouselUtils';
import { getDisplayGameForOffer, offerBelongsToStorefront } from '../../lib/gameRegions';
import { countActiveOffers, getGiftCardGames, getGamingAccountGames, getTopupGames } from '../../lib/catalogUtils';
import { pickStableOffers } from '../../lib/customerReviews';
import { DEFAULT_HOME_LAYOUT, getSectionLabel, normalizeHomeLayout } from '../../lib/homeLayout';

const HOME_GAMES_PREVIEW = 8;

function buildOfferPoolKey(offers = []) {
  return offers.map((offer) => offer.id).sort().join('|');
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
  addToCart: _addToCart,
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
  isAdminUser = false,
  homePreviewAsUser = false,
  onToggleHomePreview,
  homeLayout = DEFAULT_HOME_LAYOUT,
  reviews = [],
  user = null,
  onReviewSubmitted,
}) {
  const [sessionSeed] = useState(() => `home-${Date.now()}`);

  const getLocalLogo = (slug) => {
    if (!slug) return null;
    const s = slug.toLowerCase();
    try {
      if (s.includes('valorant')) return new URL('../../assets/valorant-logo.png', import.meta.url).href;
      if (s.includes('league') || s.includes('lol')) return new URL('../../assets/lol-logo.png', import.meta.url).href;
      if (s.includes('xbox')) return new URL('../../assets/xbox-logo.png', import.meta.url).href;
    } catch {
      // Local asset unavailable for this slug.
    }
    return null;
  };

  const layout = useMemo(() => normalizeHomeLayout(homeLayout), [homeLayout]);

  const topupGames = useMemo(() => getTopupGames(games), [games]);
  const giftCardGames = useMemo(
    () => getGiftCardGames(games)
      .map((game) => ({ ...game, offerCount: countActiveOffers(game.id, offers) }))
      .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin),
    [games, offers, isAdmin],
  );

  const gamingAccountGames = useMemo(
    () => getGamingAccountGames(games)
      .map((game) => ({ ...game, offerCount: countActiveOffers(game.id, offers) }))
      .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin),
    [games, offers, isAdmin],
  );

  const offersWithGames = useMemo(
    () => offers.filter((offer) => offerBelongsToStorefront(offer, games)),
    [offers, games],
  );

  const offerPoolKey = useMemo(() => buildOfferPoolKey(offersWithGames), [offersWithGames]);

  const suggestedOffersMap = useMemo(() => {
    const map = new Map();
    layout.forEach((section) => {
      if (section.type === 'suggested_offers' && section.enabled) {
        map.set(
          section.id,
          pickStableOffers(
            offersWithGames,
            section.limit ?? 8,
            `${sessionSeed}:${section.id}:${offerPoolKey}`,
          ),
        );
      }
    });
    return map;
  }, [layout, offerPoolKey, offersWithGames, sessionSeed]);

  const saleOffersMap = useMemo(() => {
    const map = new Map();
    layout.forEach((section) => {
      if (section.type === 'sale_offers' && section.enabled) {
        map.set(section.id, pickSaleOffers(offersWithGames, section.limit ?? 8));
      }
    });
    return map;
  }, [layout, offersWithGames]);

  const carouselGames = getCarouselGames(topupGames);

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
    const previewLimit = addOptions.previewLimit;
    const totalCount = addOptions.totalCount ?? items.length;
    const displayItems = previewLimit ? items.slice(0, previewLimit) : items;
    const showMoreLink = !!addOptions.showMoreLink && totalCount > (previewLimit || items.length);

    if (!hasItems && !showAddCard && !loading) {
      return null;
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
          <>
            <div className={`relative ${showMoreLink ? 'home-games-preview' : ''}`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {displayItems.map((game) => (
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
                {showAddCard && !showMoreLink && (
                  <AdminAddCard
                    variant="game"
                    ariaLabel={t.addGame || (lang === 'ar' ? 'إضافة لعبة' : 'Add game')}
                    onClick={() => onAddGame(addOptions)}
                  />
                )}
              </div>
              {showMoreLink && <div className="home-games-preview-fade" aria-hidden />}
            </div>
            {showMoreLink && (
              <div className="flex justify-center mt-6">
                <Link to="/games" className="btn btn-secondary inline-flex items-center gap-2">
                  {t.showMoreGames || (lang === 'ar' ? `عرض كل الألعاب (${totalCount})` : `Show more games (${totalCount})`)}
                  <ChevronDown className="w-4 h-4" />
                </Link>
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  const renderOfferCards = (items, section, addOptions = {}) => {
    const showAddCard = isAdmin && onAddOffer;
    const visibleItems = items.filter((offer) => offerBelongsToStorefront(offer, games));
    const hasItems = visibleItems.length > 0;

    if (!hasItems && !showAddCard && !loading) return null;

    const isSaleSection = addOptions.isSale ?? section?.type === 'sale_offers';

    return (
      <div className="sale-offers-section">
        {section && renderSectionHeading(section, 'sale')}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 items-stretch animate-pulse">
            {Array.from({ length: section?.limit || 5 }).map((_, i) => (
              <div key={i} className="card h-[380px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4 items-stretch">
          {visibleItems.map((offer) => {
            const game = getDisplayGameForOffer(offer, games);

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
        )}
      </div>
    );
  };

  const renderSection = (section) => {
    if (!section.enabled) return null;

    switch (section.type) {
      case 'carousel': {
        if (loading) {
          return (
            <div className="carousel-skeleton animate-pulse w-full rounded-2xl bg-[var(--bg-surface)]" />
          );
        }
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
          title_en: section.title_en || t.chooseGame || 'Choose a Game',
          title_ar: section.title_ar || t.chooseGame || 'اختر لعبتك',
        };
        return renderGamesGrid(topupGames, gamesSection, {
          previewLimit: HOME_GAMES_PREVIEW,
          totalCount: topupGames.length,
          showMoreLink: true,
        });
      }

      case 'gift_cards': {
        const limit = Math.max(1, Math.min(12, Number(section.limit) || 6));
        const giftSection = {
          ...section,
          title_en: section.title_en || t.giftCards || 'Gift Cards & Vouchers',
          title_ar: section.title_ar || t.giftCards || 'بطاقات الهدايا',
        };
        if (giftCardGames.length === 0 && !(isAdmin && onAddGame)) return null;
        return (
          <div className="games-section">
            {renderSectionHeading(giftSection, 'games')}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card h-48 sm:h-52 animate-pulse bg-[var(--bg-surface)]" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {giftCardGames.slice(0, limit).map((game) => (
                    <HomeGameCard
                      key={game.id}
                      game={game}
                      lang={lang}
                      t={t}
                      variant="voucher"
                      offerCount={game.offerCount}
                      onSelectGame={onSelectGame}
                      onEditGame={onEditGame}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
                {giftCardGames.length > limit && (
                  <div className="flex justify-center mt-6">
                    <Link to="/gift-cards" className="btn btn-secondary inline-flex items-center gap-2">
                      {t.viewAllGiftCards || (lang === 'ar' ? 'كل بطاقات الهدايا' : 'View all gift cards')}
                      <ChevronDown className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      case 'gaming_accounts': {
        const limit = Math.max(1, Math.min(12, Number(section.limit) || 6));
        const accountsSection = {
          ...section,
          title_en: section.title_en || t.gamingAccounts || 'Gaming Accounts',
          title_ar: section.title_ar || t.gamingAccounts || 'حسابات الألعاب',
        };
        if (gamingAccountGames.length === 0 && !(isAdmin && onAddGame)) return null;
        return (
          <div className="games-section">
            {renderSectionHeading(accountsSection, 'games')}
            {loading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="card h-48 sm:h-52 animate-pulse bg-[var(--bg-surface)]" />
                ))}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {gamingAccountGames.slice(0, limit).map((game) => (
                    <HomeGameCard
                      key={game.id}
                      game={game}
                      lang={lang}
                      t={t}
                      variant="account"
                      offerCount={game.offerCount}
                      onSelectGame={onSelectGame}
                      onEditGame={onEditGame}
                      isAdmin={isAdmin}
                    />
                  ))}
                </div>
                {gamingAccountGames.length > limit && (
                  <div className="flex justify-center mt-6">
                    <Link to="/accounts" className="btn btn-secondary inline-flex items-center gap-2">
                      {t.viewAllGamingAccounts || (lang === 'ar' ? 'كل الحسابات' : 'View all accounts')}
                      <ChevronDown className="w-4 h-4" />
                    </Link>
                  </div>
                )}
              </>
            )}
          </div>
        );
      }

      case 'game_picks': {
        const picked = (section.game_ids || [])
          .map((id) => topupGames.find((game) => game.id === id) || games.find((game) => game.id === id))
          .filter((game) => game && !game.parent_game_id)
          .filter(Boolean);
        if (picked.length === 0 && !(isAdmin && onAddGame)) return null;
        return renderGamesGrid(picked, section, {});
      }

      default:
        return null;
    }
  };

  const isAr = lang === 'ar';

  const previewFab = isAdminUser && typeof document !== 'undefined'
    ? createPortal(
      <button
        type="button"
        className={`home-preview-fab ${homePreviewAsUser ? 'home-preview-fab--active' : ''}`}
        onClick={() => onToggleHomePreview?.(!homePreviewAsUser)}
        title={
          homePreviewAsUser
            ? (t.homePreviewExit || (isAr ? 'العودة لوضع المسؤول' : 'Exit preview'))
            : (t.homePreviewAsUser || (isAr ? 'معاينة كزائر' : 'Preview as customer'))
        }
        aria-label={
          homePreviewAsUser
            ? (t.homePreviewExit || (isAr ? 'العودة لوضع المسؤول' : 'Exit preview'))
            : (t.homePreviewAsUser || (isAr ? 'معاينة كزائر' : 'Preview as customer'))
        }
        aria-pressed={homePreviewAsUser}
      >
        {homePreviewAsUser
          ? <EyeOff className="w-5 h-5" strokeWidth={2} />
          : <Eye className="w-5 h-5" strokeWidth={2} />}
      </button>,
      document.body,
    )
    : null;

  return (
    <div className="space-y-10 sm:space-y-14 md:space-y-16 animate-fade-in">
      {previewFab}
      {layout.map((section) => {
        const content = renderSection(section);
        if (!content) return null;
        return <div key={section.id}>{content}</div>;
      })}
    </div>
  );
}