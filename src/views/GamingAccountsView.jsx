import { UserCircle } from 'lucide-react';
import HomeGameCard from '../components/ui/HomeGameCard';
import { countActiveOffers, getGamingAccountGames } from '../lib/catalogUtils';

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
  const isAr = lang === 'ar';
  const accountGames = getGamingAccountGames(games)
    .map((game) => ({
      ...game,
      offerCount: countActiveOffers(game.id, offers),
    }))
    .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 md:mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-200 text-xs font-bold mb-4">
          <UserCircle className="w-3.5 h-3.5" strokeWidth={2.5} />
          {isAr ? t.instantCodes || 'أكواد فورية' : t.instantCodes || 'Instant codes'}
        </div>
        <h1 className="games-page-title section-heading text-3xl md:text-4xl font-black mb-2">
          {isAr ? t.gamingAccounts || 'حسابات واشتراكات الألعاب' : t.gamingAccounts || 'Gaming accounts & subscriptions'}
        </h1>
        <p className="games-page-subtitle section-subheading text-left mx-0 max-w-[56ch]">
          {isAr
            ? t.gamingAccountsDesc || 'Xbox و PlayStation واشتراكات المنصات — أكواد تُسلَّم فوراً بعد الدفع.'
            : t.gamingAccountsDesc || 'Xbox, PlayStation, and platform subscriptions — codes delivered instantly after payment.'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
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
    </div>
  );
}