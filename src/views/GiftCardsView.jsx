import { useMemo, useState } from 'react';
import { Ticket } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import HomeGameCard from '../components/ui/HomeGameCard';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import CatalogSearchBar from '../components/catalog/CatalogSearchBar';
import {
  countActiveOffers,
  filterVoucherGamesBySegment,
  getCatalogVoucherGames,
} from '../lib/catalogUtils';
import { filterGamesByQuery } from '../lib/catalogSearch';
import {
  CATALOG_NAV_ITEMS,
  getCatalogNavDesc,
  getCatalogNavLabel,
  VOUCHER_FILTER_ALL,
  VOUCHER_FILTER_GAME,
  VOUCHER_FILTER_PLATFORM,
} from '../lib/catalogNav';

const NAV_ITEM = CATALOG_NAV_ITEMS[1];

const FILTER_OPTIONS = [
  { id: VOUCHER_FILTER_ALL, labelKey: 'voucherFilterAll' },
  { id: VOUCHER_FILTER_PLATFORM, labelKey: 'voucherFilterPlatform' },
  { id: VOUCHER_FILTER_GAME, labelKey: 'voucherFilterGame' },
];

export default function GiftCardsView({
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
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');

  const initialFilter = searchParams.get('filter') === VOUCHER_FILTER_PLATFORM
    ? VOUCHER_FILTER_PLATFORM
    : searchParams.get('filter') === VOUCHER_FILTER_GAME
      ? VOUCHER_FILTER_GAME
      : VOUCHER_FILTER_ALL;

  const [segmentFilter, setSegmentFilter] = useState(initialFilter);

  const categoryLabel = getCatalogNavLabel(t, lang, NAV_ITEM);

  const voucherGames = useMemo(() => {
    const base = getCatalogVoucherGames(games)
      .map((game) => ({
        ...game,
        offerCount: countActiveOffers(game.id, offers),
      }))
      .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin);

    const segmented = filterVoucherGamesBySegment(base, segmentFilter);
    return filterGamesByQuery(segmented, query, lang);
  }, [games, offers, isAdmin, segmentFilter, query, lang]);

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
        subtitle={getCatalogNavDesc(t, lang, NAV_ITEM) || t.giftCardsDesc}
      />

      <CatalogSearchBar
        value={query}
        onChange={setQuery}
        placeholder={t.searchGiftCards}
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTER_OPTIONS.map((option) => {
          const active = segmentFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setSegmentFilter(option.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                active
                  ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--text-sec)] hover:border-[var(--accent)]/50'
              }`}
            >
              {t[option.labelKey]}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="card h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : voucherGames.length === 0 ? (
        <div className="card p-10 text-center">
          <Ticket className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-sec)]">{t.noGiftCards}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {voucherGames.map((game) => (
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
    </CatalogPageShell>
  );
}