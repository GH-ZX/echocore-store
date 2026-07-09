import { useNavigate } from 'react-router-dom';
import HomeGameCard from '../components/ui/HomeGameCard';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import { countActiveOffers, getVisibleTopupGames } from '../lib/catalogUtils';
import {
  CATALOG_NAV_ITEMS,
  getCatalogNavDesc,
  getCatalogNavLabel,
} from '../lib/catalogNav';

const NAV_ITEM = CATALOG_NAV_ITEMS[0];

export default function AllGamesView({
  games = [],
  offers = [],
  t = {},
  lang = 'en',
  onSelectGame,
  onEditGame,
  isAdmin = false,
  loading = false,
}) {
  const navigate = useNavigate();
  const isAr = lang === 'ar';
  const categoryLabel = getCatalogNavLabel(t, lang, NAV_ITEM);
  const storefrontGames = getVisibleTopupGames(games, offers, { isAdmin })
    .map((game) => ({
      ...game,
      offerCount: countActiveOffers(game.id, offers),
    }));

  return (
    <CatalogPageShell
      wide
      lang={lang}
      backLabel={t.backToHome || (isAr ? 'العودة للرئيسية' : 'Back to home')}
      onBack={() => navigate('/')}
      breadcrumb={[{ label: categoryLabel }]}
    >
      <CatalogCategoryHeader
        title={categoryLabel}
        subtitle={getCatalogNavDesc(t, lang, NAV_ITEM) || (isAr
          ? t.chooseGame || 'اختر لعبتك المفضلة وابدأ الشحن فوراً'
          : t.chooseGame || 'Choose your favorite game and start topping up instantly')}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="card h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : storefrontGames.length === 0 ? (
        <div className="card p-10 text-center text-[var(--text-sec)]">
          {isAr ? t.noGamesAvailable || 'لا توجد ألعاب متاحة حالياً.' : t.noGamesAvailable || 'No games available yet.'}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {storefrontGames.map((game) => (
            <HomeGameCard
              key={game.id}
              game={game}
              lang={lang}
              t={t}
              offerCount={game.offerCount}
              onSelectGame={onSelectGame}
              onEditGame={onEditGame}
              isAdmin={isAdmin}
            />
          ))}
        </div>
      )}

      {!loading && storefrontGames.length > 0 && (
        <p className="text-sm text-[var(--text-muted)] text-center mt-8">
          {isAr
            ? t.clickAnyGame || 'اضغط على أي لعبة لعرض العروض المتاحة'
            : t.clickAnyGame || 'Click any game to view available offers'}
        </p>
      )}
    </CatalogPageShell>
  );
}