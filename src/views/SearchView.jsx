import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, Gamepad2, Tag } from 'lucide-react';
import BorderGlow from '../components/ui/BorderGlow';
import SaleOfferCard from '../components/ui/SaleOfferCard';
import { presetImageUrl } from '../lib/imageUtils';
import { getDisplayGameForOffer } from '../lib/gameRegions';
import { filterGamesByQuery, filterOffersByQuery } from '../lib/searchUtils';

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
};

const listMotion = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const itemMotion = {
  initial: { opacity: 0, y: 18, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.32, ease: [0.22, 1, 0.36, 1] },
};

export default function SearchView({
  games = [],
  offers = [],
  t = {},
  lang = 'ar',
  loading = false,
  onSelectGame,
  onSelectOffer,
  onBuyNow,
}) {
  const [searchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const isAr = lang === 'ar';

  const matchedGames = useMemo(
    () => filterGamesByQuery(games, query),
    [games, query],
  );

  const matchedOffers = useMemo(
    () => filterOffersByQuery(offers, games, query).slice(0, 12),
    [offers, games, query],
  );

  if (!query) {
    return (
      <motion.div {...pageMotion} className="max-w-3xl mx-auto text-center py-20">
        <Search className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-4" strokeWidth={1.75} />
        <h1 className="text-2xl font-black mb-2">
          {isAr ? t.searchGames || 'ابحث عن الألعاب' : t.searchGames || 'Search games'}
        </h1>
        <p className="text-[var(--text-sec)]">
          {isAr
            ? t.searchPrompt || 'اكتب اسم لعبة في شريط البحث أعلى الصفحة.'
            : t.searchPrompt || 'Type a game name in the search bar above.'}
        </p>
      </motion.div>
    );
  }

  return (
    <motion.div {...pageMotion} className="max-w-7xl mx-auto">
      <div className="mb-8 md:mb-10">
        <motion.div
          initial={{ opacity: 0, x: isAr ? 12 : -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-bold mb-4"
        >
          <Search className="w-3.5 h-3.5" strokeWidth={2.5} />
          {isAr ? t.searchResults || 'نتائج البحث' : t.searchResults || 'Search results'}
        </motion.div>

        <h1 className="games-page-title section-heading text-3xl md:text-4xl font-black mb-2">
          {isAr ? `${t.resultsFor || 'نتائج لـ'} "${query}"` : `${t.resultsFor || 'Results for'} "${query}"`}
        </h1>
        <p className="games-page-subtitle section-subheading text-left mx-0 max-w-[50ch]">
          {loading
            ? (isAr ? t.loading || 'جاري التحميل...' : t.loading || 'Loading...')
            : (isAr
              ? `${matchedGames.length} لعبة • ${matchedOffers.length} عرض`
              : `${matchedGames.length} games • ${matchedOffers.length} offers`)}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {Array.from({ length: 8 }).map((_, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0.4 }}
              animate={{ opacity: [0.4, 0.85, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity, delay: index * 0.08 }}
              className="card h-52 bg-[var(--bg-surface)]"
            />
          ))}
        </div>
      ) : matchedGames.length === 0 && matchedOffers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-10 text-center"
        >
          <Gamepad2 className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-lg text-[var(--text-sec)]">
            {isAr ? t.noResults || 'لا توجد نتائج مطابقة.' : t.noResults || 'No games match your search.'}
          </p>
        </motion.div>
      ) : (
        <div className="space-y-10">
          {matchedGames.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Gamepad2 className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="text-xl font-bold">{isAr ? t.allGames || 'الألعاب' : t.allGames || 'Games'}</h2>
              </div>

              <motion.div
                variants={listMotion}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {matchedGames.map((game) => (
                  <motion.div key={game.id} variants={itemMotion}>
                    <BorderGlow
                      edgeSensitivity={25}
                      borderRadius={16}
                      glowRadius={30}
                      glowIntensity={0.8}
                      coneSpread={25}
                      fillOpacity={0.35}
                    >
                      <button
                        type="button"
                        onClick={() => onSelectGame?.(game)}
                        className="games-card group w-full text-left transition-all duration-300 active:scale-[0.985]"
                      >
                        <div className="relative h-48 sm:h-52">
                          {game.image_url ? (
                            <img
                              src={presetImageUrl(game.image_url, 'cardCover')}
                              alt={isAr ? game.name_ar : game.name_en}
                              loading="lazy"
                              decoding="async"
                              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                            />
                          ) : (
                            <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
                          )}
                          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
                          <div className="absolute bottom-0 left-0 right-0 p-4">
                            <div className="font-bold text-lg sm:text-xl text-white">
                              {isAr ? game.name_ar : game.name_en}
                            </div>
                            <div className="text-xs sm:text-sm text-white/70 mt-0.5">
                              {game.points_name} {isAr ? 'توب أب' : 'top-ups'}
                            </div>
                          </div>
                        </div>
                      </button>
                    </BorderGlow>
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {matchedOffers.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Tag className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="text-xl font-bold">{isAr ? t.offers || 'العروض' : t.offers || 'Offers'}</h2>
              </div>

              <motion.div
                variants={listMotion}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
              >
                {matchedOffers.map((offer) => (
                  <motion.div key={offer.id} variants={itemMotion}>
                    <SaleOfferCard
                      offer={offer}
                      game={getDisplayGameForOffer(offer, games)}
                      t={t}
                      lang={lang}
                      onSelectOffer={onSelectOffer}
                      onBuyNow={onBuyNow}
                      className="w-full min-w-0"
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}
        </div>
      )}
    </motion.div>
  );
}