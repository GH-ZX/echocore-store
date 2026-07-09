import { Ticket } from 'lucide-react';
import HomeGameCard from '../components/ui/HomeGameCard';
import { countActiveOffers, getGiftCardGames } from '../lib/catalogUtils';

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
  const isAr = lang === 'ar';
  const voucherGames = getGiftCardGames(games)
    .map((game) => ({
      ...game,
      offerCount: countActiveOffers(game.id, offers),
    }))
    .filter((game) => game.offerCount > 0 || game.catalog_source === 'live' || isAdmin);

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 md:mb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-200 text-xs font-bold mb-4">
          <Ticket className="w-3.5 h-3.5" strokeWidth={2.5} />
          {isAr ? t.instantCodes || 'أكواد فورية' : t.instantCodes || 'Instant codes'}
        </div>
        <h1 className="games-page-title section-heading text-3xl md:text-4xl font-black mb-2">
          {isAr ? t.giftCards || 'بطاقات الهدايا' : t.giftCards || 'Gift cards & vouchers'}
        </h1>
        <p className="games-page-subtitle section-subheading text-left mx-0 max-w-[56ch]">
          {isAr
            ? t.giftCardsDesc || 'اشترِ أكواد شحن جاهزة — تُسلَّم فوراً في إيصال الطلب بعد الدفع.'
            : t.giftCardsDesc || 'Buy ready-to-use redeem codes — delivered instantly on your order receipt after payment.'}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="card h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : voucherGames.length === 0 ? (
        <div className="card p-10 text-center">
          <Ticket className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-[var(--text-sec)]">
            {isAr
              ? t.noGiftCards || 'لا توجد بطاقات هدايا متاحة حالياً.'
              : t.noGiftCards || 'No gift cards available yet.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {voucherGames.map((game) => (
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
      )}


    </div>
  );
}