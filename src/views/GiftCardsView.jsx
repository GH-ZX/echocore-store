import { Ticket } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import HomeGameCard from '../components/ui/HomeGameCard';
import CatalogCategoryHeader from '../components/catalog/CatalogCategoryHeader';
import CatalogPageShell from '../components/catalog/CatalogPageShell';
import { countActiveOffers, getGiftCardGames } from '../lib/catalogUtils';
import {
  CATALOG_NAV_ITEMS,
  getCatalogNavDesc,
  getCatalogNavLabel,
} from '../lib/catalogNav';

const NAV_ITEM = CATALOG_NAV_ITEMS[1];

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
  const isAr = lang === 'ar';
  const categoryLabel = getCatalogNavLabel(t, lang, NAV_ITEM);
  const voucherGames = getGiftCardGames(games)
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
          ? t.giftCardsDesc || 'اشترِ أكواد شحن جاهزة — تُسلَّم فوراً في إيصال الطلب بعد الدفع.'
          : t.giftCardsDesc || 'Buy ready-to-use redeem codes — delivered instantly on your order receipt after payment.')}
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6">
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
    </CatalogPageShell>
  );
}