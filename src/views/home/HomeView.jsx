import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Eye, EyeOff } from 'lucide-react';
import ProductCarousel from './ProductCarousel';
import SaleOfferCard from '../../components/ui/SaleOfferCard';
import HomeGameCard from '../../components/ui/HomeGameCard';
import CustomerReviewsSection from './CustomerReviewsSection';
import SocialLinksHomeSection from '../../components/home/SocialLinksHomeSection';
import HomeExpandableGrid from '../../components/home/HomeExpandableGrid';
import AdminAddCard from '../../components/admin/AdminAddCard';
import { getCarouselGames, resolveCarouselLogo } from '../../lib/carouselUtils';
import {
  getDisplayGameForOffer,
  offerBelongsToStorefront,
} from '../../lib/gameRegions';
import {
  countActiveOffers,
  getCatalogVoucherGames,
  getVisibleTopupGames,
} from '../../lib/catalogUtils';
import { pickStableOffers } from '../../lib/customerReviews';
import { brandUserText } from '../../lib/branding';
import { getGameMarketingDescription } from '../../lib/gameDescriptions';
import { DEFAULT_HOME_LAYOUT, getSectionLabel, normalizeHomeLayout } from '../../lib/homeLayout';
import {
  HOME_GRID_DENSE,
  HOME_GRID_VOUCHER,
  skeletonCountForWidth,
} from '../../lib/homeExpandableGrid';

function stripPlainText(value = '') {
  return String(value)
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveCarouselDescription(game, games = [], offers = [], t = {}) {
  const marketingEn = getGameMarketingDescription(game, 'en', games, offers, t);
  const marketingAr = getGameMarketingDescription(game, 'ar', games, offers, t);
  if (marketingEn || marketingAr) {
    return {
      description_en: stripPlainText(marketingEn),
      description_ar: stripPlainText(marketingAr || marketingEn),
    };
  }

  const en = stripPlainText(game.description_en || '');
  const ar = stripPlainText(game.description_ar || '');
  return {
    description_en: brandUserText(en),
    description_ar: brandUserText(ar || en),
  };
}

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

function denseGridSkeleton() {
  const count = skeletonCountForWidth(typeof window !== 'undefined' ? window.innerWidth : 1024, 'dense');
  return (
    <div className={`${HOME_GRID_DENSE} animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card h-[380px] bg-[var(--bg-surface)] border border-[var(--border)] rounded-2xl" />
      ))}
    </div>
  );
}

function voucherGridSkeleton() {
  const count = skeletonCountForWidth(typeof window !== 'undefined' ? window.innerWidth : 1024, 'voucher');
  return (
    <div className={`${HOME_GRID_VOUCHER} animate-pulse`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card h-48 sm:h-52 bg-[var(--bg-surface)]" />
      ))}
    </div>
  );
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
  onPickCarouselGame,
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

  const layout = useMemo(() => normalizeHomeLayout(homeLayout), [homeLayout]);

  const topupGames = useMemo(
    () => getVisibleTopupGames(games, offers, { isAdmin }),
    [games, offers, isAdmin],
  );

  const topupGamesWithStats = useMemo(() => topupGames.map((game) => {
    const activeOffers = offers.filter(
      (offer) => offer.game_id === game.id && offer.active !== false,
    );
    const description = getGameMarketingDescription(game, lang, games, offers, t);
    return {
      ...game,
      packCount: activeOffers.length,
      marketingDescription: description,
    };
  }), [topupGames, games, offers, lang, t]);

  const voucherGames = useMemo(
    () => getCatalogVoucherGames(games)
      .map((game) => ({ ...game, offerCount: countActiveOffers(game.id, offers) }))
      .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin)
      .sort((a, b) => {
        const nameA = String(a.name_en || a.name_ar || '').toLowerCase();
        const nameB = String(b.name_en || b.name_ar || '').toLowerCase();
        return nameA.localeCompare(nameB);
      }),
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

  const carouselItems = carouselGames.map((g) => {
    const descriptions = resolveCarouselDescription(g, games, offers, t);
    return {
      id: g.id,
      name_en: g.name_en,
      name_ar: g.name_ar,
      image_url: g.image_url,
      logo_url: resolveCarouselLogo(g, games),
      description_en: descriptions.description_en,
      description_ar: descriptions.description_ar,
      carousel_focus_x: g.carousel_focus_x ?? 50,
      carousel_focus_y: g.carousel_focus_y ?? 50,
      category: 'games',
      price: 0,
    };
  });

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

  const renderSectionSubtitle = (text) => (
    text ? (
      <p className="text-center text-sm text-[var(--text-muted)] -mt-2 mb-6 max-w-2xl mx-auto px-4">
        {text}
      </p>
    ) : null
  );

  const renderSectionBlock = (section, style, subtitle, content) => {
    if (!content) return null;
    const shellClass = style === 'games' ? 'games-section home-games-section' : 'sale-offers-section';
    return (
      <div className={shellClass}>
        {section && renderSectionHeading(section, style)}
        {renderSectionSubtitle(subtitle)}
        {content}
      </div>
    );
  };

  const renderGamesExpandable = (section, items, options = {}) => {
    const sectionTitle = getSectionLabel(section, lang);
    const showAddCard = isAdmin && onAddGame && !options.hideAdd;

    if (items.length === 0 && !showAddCard && !loading) return null;

    return (
      <HomeExpandableGrid
        sectionKey={`${section.id}-${items.length}`}
        items={items}
        sectionTitle={sectionTitle}
        gridClassName={options.gridClassName || HOME_GRID_DENSE}
        layoutId={options.layoutId || 'dense'}
        loading={loading}
        loadingSkeleton={options.loadingSkeleton || denseGridSkeleton()}
        t={t}
        footerSlot={showAddCard ? (
          <AdminAddCard
            variant="game"
            ariaLabel={t.addGame}
            onClick={() => onAddGame(options.addContext || {})}
          />
        ) : null}
        renderItem={(game, { isTeaser }) => (
          <HomeGameCard
            game={game}
            lang={lang}
            t={t}
            description={game.marketingDescription}
            packCount={game.packCount}
            offerCount={game.offerCount}
            teaser={isTeaser}
            onSelectGame={isTeaser ? undefined : onSelectGame}
            onEditGame={isTeaser ? undefined : onEditGame}
            isAdmin={isAdmin && !isTeaser}
            className="w-full min-w-0 h-full"
          />
        )}
      />
    );
  };

  const renderOffersExpandable = (section, items, { isSale = false } = {}) => {
    const sectionTitle = getSectionLabel(section, lang);
    const visibleItems = items.filter((offer) => {
      if (!offerBelongsToStorefront(offer, games)) return false;
      return !!getDisplayGameForOffer(offer, games);
    });
    const showAddCard = isAdmin && onAddOffer;

    if (visibleItems.length === 0 && !showAddCard && !loading) return null;

    return (
      <HomeExpandableGrid
        sectionKey={`${section.id}-${visibleItems.length}`}
        items={visibleItems}
        sectionTitle={sectionTitle}
        gridClassName={HOME_GRID_DENSE}
        layoutId="dense"
        loading={loading}
        loadingSkeleton={denseGridSkeleton()}
        t={t}
        footerSlot={showAddCard ? (
          <AdminAddCard
            variant="offer"
            className="w-full min-w-0"
            ariaLabel={isSale ? t.addSaleOffer : t.addOffer}
            onClick={() => onAddOffer({ isSale })}
          />
        ) : null}
        renderItem={(offer, { isTeaser }) => {
          const game = getDisplayGameForOffer(offer, games);
          return (
            <SaleOfferCard
              offer={offer}
              game={game}
              t={t}
              lang={lang}
              onSelectOffer={isTeaser ? undefined : onSelectOffer}
              onBuyNow={isTeaser ? undefined : onBuyNow}
              onEditOffer={isTeaser ? undefined : onEditOffer}
              isAdmin={isAdmin && !isTeaser}
              className={`w-full min-w-0${isTeaser ? ' storefront-card--teaser pointer-events-none' : ''}`}
            />
          );
        }}
      />
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
        if (carouselGames.length === 0 && !(isAdmin && onPickCarouselGame)) return null;
        return (
          <ProductCarousel
            key={section.id}
            products={carouselItems}
            t={t}
            lang={lang}
            isAdmin={isAdmin}
            onManageCarousel={onManageCarousel}
            onPickCarouselGame={onPickCarouselGame}
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
        return renderSectionBlock(
          section,
          'sale',
          null,
          renderOffersExpandable(section, saleItems, { isSale: true }),
        );
      }

      case 'offer_picks': {
        const picked = (section.offer_ids || [])
          .map((id) => offersWithGames.find((offer) => offer.id === id))
          .filter(Boolean);
        return renderSectionBlock(
          section,
          'sale',
          null,
          renderOffersExpandable(section, picked, { isSale: false }),
        );
      }

      case 'suggested_offers': {
        const pickedItems = suggestedOffersMap.get(section.id) || [];
        return renderSectionBlock(
          section,
          'sale',
          null,
          renderOffersExpandable(section, pickedItems, { isSale: false }),
        );
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
          title_en: section.title_en || t.g2bulkTopupsNav || t.chooseGame,
          title_ar: section.title_ar || t.g2bulkTopupsNav || t.chooseGame,
        };
        const gamesContent = renderGamesExpandable(gamesSection, topupGamesWithStats);
        if (!gamesContent) return null;
        return renderSectionBlock(
          gamesSection,
          'games',
          t.g2bulkTopupsDesc,
          gamesContent,
        );
      }

      case 'gift_cards': {
        const giftSection = {
          ...section,
          title_en: section.title_en || t.g2bulkVouchersNav || t.giftCards,
          title_ar: section.title_ar || t.g2bulkVouchersNav || t.giftCards,
        };
        return renderSectionBlock(
          giftSection,
          'games',
          t.g2bulkVouchersDesc,
          renderGamesExpandable(giftSection, voucherGames, {
            gridClassName: HOME_GRID_VOUCHER,
            layoutId: 'voucher',
            loadingSkeleton: voucherGridSkeleton(),
          }),
        );
      }

      case 'gaming_accounts':
        return null;

      case 'game_picks': {
        const picked = (section.game_ids || [])
          .map((id) => topupGames.find((game) => game.id === id) || games.find((game) => game.id === id))
          .filter(Boolean);
        if (picked.length === 0 && !loading && !(isAdmin && onAddGame)) return null;
        return renderSectionBlock(
          section,
          'sale',
          null,
          renderGamesExpandable(section, picked, { hideAdd: true }),
        );
      }

      case 'social_links':
        return (
          <SocialLinksHomeSection
            key={section.id}
            section={section}
            lang={lang}
            t={t}
          />
        );

      default:
        return null;
    }
  };

  const previewFab = isAdminUser && typeof document !== 'undefined'
    ? createPortal(
      <button
        type="button"
        className={`home-preview-fab ${homePreviewAsUser ? 'home-preview-fab--active' : ''}`}
        onClick={() => onToggleHomePreview?.(!homePreviewAsUser)}
        title={homePreviewAsUser ? t.homePreviewExit : t.homePreviewAsUser}
        aria-label={homePreviewAsUser ? t.homePreviewExit : t.homePreviewAsUser}
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