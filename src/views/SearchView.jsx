import { useMemo, useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Gamepad2, Tag, Ticket, UserCircle, X, ArrowRight } from 'lucide-react';
import HomeGameCard from '../components/ui/HomeGameCard';
import SaleOfferCard from '../components/ui/SaleOfferCard';
import { getDisplayGameForOffer } from '../lib/gameRegions';
import {
  countActiveOffers,
  getGiftCardGames,
  getGamingAccountGames,
  getVisibleTopupGames,
} from '../lib/catalogUtils';
import { formatCountNoun, formatMessage } from '../lib/i18n';
import {
  filterGamesByQuery,
  filterOffersByQuery,
  filterTopupGamesByQuery,
  parseSearchCatalogFilter,
  SEARCH_FILTER_ACCOUNT,
  SEARCH_FILTER_ALL,
  SEARCH_FILTER_GIFT_CARD,
  SEARCH_FILTER_OFFERS,
  SEARCH_FILTER_TOPUP,
} from '../lib/searchUtils';

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

const FILTER_OPTIONS = [
  { id: SEARCH_FILTER_ALL, labelKey: 'searchFilterAll' },
  { id: SEARCH_FILTER_TOPUP, labelKey: 'searchFilterTopup' },
  { id: SEARCH_FILTER_GIFT_CARD, labelKey: 'searchFilterGiftCard' },
  { id: SEARCH_FILTER_ACCOUNT, labelKey: 'searchFilterAccount' },
  { id: SEARCH_FILTER_OFFERS, labelKey: 'searchFilterOffers' },
];

export default function SearchView({
  games = [],
  offers = [],
  t = {},
  lang = 'ar',
  loading = false,
  onSelectGame,
  onSelectOffer,
  onBuyNow,
  addToCart,
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = (searchParams.get('q') || '').trim();
  const catalogFilter = parseSearchCatalogFilter(searchParams.get('type'));
  const isAr = lang === 'ar';
  const [draft, setDraft] = useState(query);
  const searchInputRef = useRef(null);

  useEffect(() => {
    setDraft(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const submitSearch = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const next = new URLSearchParams(searchParams);
    next.set('q', trimmed);
    setSearchParams(next, { replace: true });
  };

  const handleClearSearch = () => {
    setDraft('');
    const next = new URLSearchParams(searchParams);
    next.delete('q');
    setSearchParams(next, { replace: true });
    searchInputRef.current?.focus();
  };

  const searchForm = (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submitSearch();
      }}
      className="search-view-field"
    >
      <div className="pl-3 text-[var(--accent)]" aria-hidden="true">
        <Search className="w-5 h-5" strokeWidth={2} />
      </div>
      <input
        ref={searchInputRef}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={t.searchPlaceholderShort}
        className="search-view-input"
        aria-label={t.headerSearchGames}
      />
      <AnimatePresence>
        {draft && (
          <motion.button
            key="search-view-clear"
            type="button"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onClick={handleClearSearch}
            className="search-view-clear"
            aria-label={t.clearSearch}
          >
            <X className="w-4 h-4" strokeWidth={2} />
          </motion.button>
        )}
      </AnimatePresence>
      <motion.button
        type="submit"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="search-view-submit"
        aria-label={t.searchAction}
        disabled={!draft.trim()}
      >
        <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
      </motion.button>
    </form>
  );

  const matchedTopupGames = useMemo(() => {
    const matchedIds = new Set(
      filterTopupGamesByQuery(games, query).map((game) => game.id),
    );
    return getVisibleTopupGames(games, offers).filter((game) => matchedIds.has(game.id));
  }, [games, offers, query]);

  const matchedVoucherGames = useMemo(
    () => filterGamesByQuery(games, query),
    [games, query],
  );

  const matchedGiftCardGames = useMemo(
    () => getGiftCardGames(matchedVoucherGames)
      .map((game) => ({ ...game, offerCount: countActiveOffers(game.id, offers) }))
      .filter((game) => game.offerCount > 0),
    [matchedVoucherGames, offers],
  );

  const matchedAccountGames = useMemo(
    () => getGamingAccountGames(matchedVoucherGames)
      .map((game) => ({ ...game, offerCount: countActiveOffers(game.id, offers) }))
      .filter((game) => game.offerCount > 0),
    [matchedVoucherGames, offers],
  );

  const matchedOffers = useMemo(
    () => filterOffersByQuery(offers, games, query).slice(0, 12),
    [offers, games, query],
  );

  const showTopup = catalogFilter === SEARCH_FILTER_ALL || catalogFilter === SEARCH_FILTER_TOPUP;
  const showGiftCards = catalogFilter === SEARCH_FILTER_ALL || catalogFilter === SEARCH_FILTER_GIFT_CARD;
  const showAccounts = catalogFilter === SEARCH_FILTER_ALL || catalogFilter === SEARCH_FILTER_ACCOUNT;
  const showOffers = catalogFilter === SEARCH_FILTER_ALL || catalogFilter === SEARCH_FILTER_OFFERS;

  const visibleTopupGames = showTopup ? matchedTopupGames : [];
  const visibleGiftCardGames = showGiftCards ? matchedGiftCardGames : [];
  const visibleAccountGames = showAccounts ? matchedAccountGames : [];
  const visibleOffers = showOffers ? matchedOffers : [];

  const catalogCount = visibleTopupGames.length
    + visibleGiftCardGames.length
    + visibleAccountGames.length;

  const setCatalogFilter = (nextFilter) => {
    const next = new URLSearchParams(searchParams);
    if (nextFilter === SEARCH_FILTER_ALL) {
      next.delete('type');
    } else {
      next.set('type', nextFilter);
    }
    setSearchParams(next, { replace: true });
  };

  if (!query) {
    return (
      <motion.div {...pageMotion} className="max-w-3xl mx-auto py-10">
        <div className="mb-8">
          {searchForm}
        </div>
        <div className="text-center">
          <Search className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-4" strokeWidth={1.75} />
          <h1 className="text-2xl font-black mb-2">{t.searchGames}</h1>
          <p className="text-[var(--text-sec)]">{t.searchPrompt}</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div {...pageMotion} className="max-w-7xl mx-auto">
      <div className="mb-6 md:mb-8">
        {searchForm}
      </div>
      <div className="mb-8 md:mb-10">
        <motion.div
          initial={{ opacity: 0, x: isAr ? 12 : -12 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--accent)]/25 bg-[var(--accent)]/10 text-[var(--accent)] text-xs font-bold mb-4"
        >
          <Search className="w-3.5 h-3.5" strokeWidth={2.5} />
          {t.searchResults}
        </motion.div>

        <h1 className="games-page-title section-heading text-3xl md:text-4xl font-black mb-2">
          {`${t.resultsFor} "${query}"`}
        </h1>
        <p className="games-page-subtitle section-subheading text-left mx-0 max-w-[50ch]">
          {loading
            ? t.loading
            : formatMessage(t.searchResultsSummary, {
              products: formatCountNoun(t, lang, catalogCount, 'productCount'),
              offers: formatCountNoun(t, lang, visibleOffers.length, 'offerCount'),
            })}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
        {FILTER_OPTIONS.map((option) => {
          const active = catalogFilter === option.id;
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => setCatalogFilter(option.id)}
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
      ) : catalogCount === 0 && visibleOffers.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card p-10 text-center"
        >
          <Gamepad2 className="w-10 h-10 mx-auto text-[var(--text-muted)] mb-3" />
          <p className="text-lg text-[var(--text-sec)]">{t.noResults}</p>
        </motion.div>
      ) : (
        <div className="space-y-10">
          {visibleTopupGames.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Gamepad2 className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="text-xl font-bold">{t.allGames}</h2>
              </div>

              <motion.div
                variants={listMotion}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {visibleTopupGames.map((game) => (
                  <motion.div key={game.id} variants={itemMotion}>
                    <HomeGameCard
                      game={game}
                      lang={lang}
                      t={t}
                      onSelectGame={onSelectGame}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {visibleGiftCardGames.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Ticket className="w-5 h-5 text-violet-300" />
                <h2 className="text-xl font-bold">{t.giftCards}</h2>
              </div>

              <motion.div
                variants={listMotion}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {visibleGiftCardGames.map((game) => (
                  <motion.div key={game.id} variants={itemMotion}>
                    <HomeGameCard
                      game={game}
                      lang={lang}
                      t={t}
                      variant="voucher"
                      offerCount={game.offerCount}
                      onSelectGame={onSelectGame}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {visibleAccountGames.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <UserCircle className="w-5 h-5 text-sky-300" />
                <h2 className="text-xl font-bold">{t.searchGamingAccounts}</h2>
              </div>

              <motion.div
                variants={listMotion}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
              >
                {visibleAccountGames.map((game) => (
                  <motion.div key={game.id} variants={itemMotion}>
                    <HomeGameCard
                      game={game}
                      lang={lang}
                      t={t}
                      variant="account"
                      offerCount={game.offerCount}
                      onSelectGame={onSelectGame}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}

          {visibleOffers.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-5">
                <Tag className="w-5 h-5 text-[var(--accent)]" />
                <h2 className="text-xl font-bold">{t.offers}</h2>
              </div>

              <motion.div
                variants={listMotion}
                initial="initial"
                animate="animate"
                className="grid grid-cols-1 min-[400px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
              >
                {visibleOffers.map((offer) => (
                  <motion.div key={offer.id} variants={itemMotion}>
                    <SaleOfferCard
                      offer={offer}
                      game={getDisplayGameForOffer(offer, games)}
                      t={t}
                      lang={lang}
                      onSelectOffer={onSelectOffer}
                      onBuyNow={onBuyNow}
                      onAddToCart={addToCart}
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