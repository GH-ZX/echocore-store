import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import HomeGameCard from '../components/ui/HomeGameCard';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import CatalogSearchBar from '../components/catalog/CatalogSearchBar';
import CatalogGrid from '../components/catalog/CatalogGrid';
import { countActiveOffers, getVisibleTopupGames } from '../lib/catalogUtils';
import { filterGamesByQuery } from '../lib/searchUtils';
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
  const [query, setQuery] = useState('');
  const categoryLabel = getCatalogNavLabel(t, lang, NAV_ITEM);

  const storefrontGames = useMemo(() => {
    const base = getVisibleTopupGames(games, offers, { isAdmin })
      .map((game) => ({
        ...game,
        offerCount: countActiveOffers(game.id, offers),
      }));
    return filterGamesByQuery(base, query);
  }, [games, offers, isAdmin, query]);

  return (
    <CatalogPageShell
      wide
      lang={lang}
      backLabel={t.backToHome}
      onBack={() => navigate('/')}
      breadcrumb={[{ label: categoryLabel }]}
    >
      <CatalogCategoryHeader
        title={categoryLabel}
        subtitle={getCatalogNavDesc(t, lang, NAV_ITEM) || t.chooseGame}
      />

      <CatalogSearchBar
        value={query}
        onChange={setQuery}
        placeholder={t.searchTopupGames}
      />

      <CatalogGrid loading={loading} count={storefrontGames.length} emptyTitle={t.noGamesAvailable}>
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
      </CatalogGrid>

      {!loading && storefrontGames.length > 0 && (
        <p className="text-sm text-[var(--text-muted)] text-center mt-8">
          {t.clickAnyGame}
        </p>
      )}
    </CatalogPageShell>
  );
}