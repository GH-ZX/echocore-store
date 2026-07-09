import { UserCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HomeGameCard from '../components/ui/HomeGameCard';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import { countActiveOffers, getGamingAccountGames } from '../lib/catalogUtils';
import {
  CATALOG_NAV_ITEMS,
  getCatalogNavDesc,
  getCatalogNavLabel,
} from '../lib/catalogNav';

const NAV_ITEM = CATALOG_NAV_ITEMS[2];

export default function GamingAccountsView({
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
  const accountGames = getGamingAccountGames(games)
    .map((game) => ({
      ...game,
      offerCount: countActiveOffers(game.id, offers),
    }))
    .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin);

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
          ? t.gamingAccountsDesc || 'Xbox و PlayStation واشتراكات المنصات — أكواد تُسلَّم فوراً بعد الدفع.'
          : t.gamingAccountsDesc || 'Xbox, PlayStation, and platform subscriptions — codes delivered instantly after payment.')}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="card h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : accountGames.length === 0 ? (
        <div className="card p-10 text-center">
          <UserCircle className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-sec)]">
            {isAr
              ? t.noGamingAccounts || 'لا توجد حسابات أو اشتراكات متاحة حالياً.'
              : t.noGamingAccounts || 'No gaming accounts or subscriptions available yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {accountGames.map((game) => (
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
      )}
    </CatalogPageShell>
  );
}