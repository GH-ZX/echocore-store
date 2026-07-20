import { useMemo, useState } from 'react';
import { X, Search, Plus, ExternalLink, Gamepad2, Gift } from 'lucide-react';
import Modal from '../ui/Modal';
import {
  getCarouselPickableGames,
  isCarouselRedeemItem,
  resolveCarouselLogo,
} from '../../lib/carouselUtils';

const FILTERS = [
  { id: 'all', labelKey: 'carouselPickerAll' },
  { id: 'games', labelKey: 'carouselPickerGames' },
  { id: 'redeem', labelKey: 'carouselPickerRedeem' },
];

export default function CarouselAddPicker({
  games = [],
  lang = 'ar',
  t = {},
  onClose,
  onPick,
  onGoToAddGames,
}) {
  const isAr = lang === 'ar';
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');

  const pickableGames = useMemo(
    () => getCarouselPickableGames(games, { kind: filter }),
    [games, filter],
  );

  const counts = useMemo(() => ({
    all: getCarouselPickableGames(games, { kind: 'all' }).length,
    games: getCarouselPickableGames(games, { kind: 'games' }).length,
    redeem: getCarouselPickableGames(games, { kind: 'redeem' }).length,
  }), [games]);

  const filteredGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickableGames;
    return pickableGames.filter((game) => {
      const name = String(game.name_en || game.name_ar || '').toLowerCase();
      return name.includes(q);
    });
  }, [pickableGames, query]);

  const gameName = (game) => (isAr ? game.name_ar : game.name_en) || game.name_en || game.name_ar;

  const filterLabel = (id) => {
    if (id === 'all') return t.carouselPickerAll || (isAr ? 'الكل' : 'All');
    if (id === 'games') return t.carouselPickerGames || (isAr ? 'ألعاب' : 'Games');
    if (id === 'redeem') return t.carouselPickerRedeem || (isAr ? 'أكواد استرداد' : 'Redeem codes');
    return id;
  };

  const emptyMessage = () => {
    if (pickableGames.length === 0) {
      if (filter === 'redeem') {
        return t.carouselPickerEmptyRedeem
          || (isAr
            ? 'لا توجد أكواد استرداد أخرى. أضفها من G2Bulk أو فعّلها في الكتالوج.'
            : 'No more redeem codes available. Sync from G2Bulk or enable them in catalog.');
      }
      if (filter === 'games') {
        return t.carouselPickerEmptyGames
          || (isAr
            ? 'لا توجد ألعاب أخرى في المتجر. أضف ألعاباً من G2Bulk أولاً.'
            : 'No more store games available. Add games from G2Bulk first.');
      }
      return t.carouselPickerEmptyAll
        || (isAr
          ? 'لا عناصر أخرى للإضافة. أضف من G2Bulk أولاً.'
          : 'Nothing else to add. Sync from G2Bulk first.');
    }
    return t.carouselPickerNoMatch || (isAr ? 'لا توجد نتائج مطابقة.' : 'No matching results.');
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      zIndex={110}
      ariaLabelledBy="carousel-add-picker-title"
      panelClassName="flex flex-col overflow-hidden max-h-[min(80dvh,560px)]"
      scrollable={false}
    >
      <div className="modal-panel__header shrink-0">
        <div className="min-w-0">
          <h2 id="carousel-add-picker-title" className="text-base font-bold truncate">
            {t.addToCarousel || (isAr ? 'إضافة إلى الكاروسيل' : 'Add to carousel')}
          </h2>
          <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
            {t.carouselPickerHelp
              || (isAr
                ? 'اختر ألعاب شحن أو أكواد استرداد من المتجر'
                : 'Pick top-up games or redeem codes from your store')}
          </p>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 shrink-0">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 py-2 border-b border-[var(--border)] shrink-0 space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => {
            const active = filter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                  active
                    ? 'border-[var(--accent)] bg-[var(--accent)]/15 text-[var(--accent)]'
                    : 'border-[var(--border)] text-[var(--text-sec)] hover:text-[var(--text)]'
                }`}
              >
                {filterLabel(f.id)}
                <span className="ms-1 opacity-70 font-mono">{counts[f.id] ?? 0}</span>
              </button>
            );
          })}
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.search || (isAr ? 'بحث…' : 'Search…')}
            className="input w-full pl-9 min-h-[40px] text-left"
            dir="ltr"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
        {filteredGames.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] text-center py-8">
            {emptyMessage()}
          </p>
        ) : (
          filteredGames.map((game) => {
            const thumbSrc = resolveCarouselLogo(game, games);
            const isRedeem = isCarouselRedeemItem(game);
            return (
              <div
                key={game.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                {thumbSrc ? (
                  <img
                    src={thumbSrc}
                    alt=""
                    className="w-9 h-9 object-contain rounded shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded bg-[var(--bg-elevated)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{gameName(game)}</div>
                  <div className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-semibold ${
                    isRedeem ? 'text-violet-300' : 'text-[var(--text-muted)]'
                  }`}
                  >
                    {isRedeem ? (
                      <>
                        <Gift className="w-3 h-3" />
                        {t.carouselPickerRedeemBadge || (isAr ? 'كود استرداد' : 'Redeem')}
                      </>
                    ) : (
                      <>
                        <Gamepad2 className="w-3 h-3" />
                        {t.carouselPickerGameBadge || (isAr ? 'لعبة' : 'Game')}
                      </>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPick?.(game)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[var(--accent)]/30 text-[var(--accent)] text-xs font-semibold hover:bg-[var(--accent)]/10 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  {t.add || (isAr ? 'إضافة' : 'Add')}
                </button>
              </div>
            );
          })
        )}
      </div>

      <div className="px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-primary)]/40 shrink-0">
        <button
          type="button"
          onClick={onGoToAddGames}
          className="btn btn-secondary w-full inline-flex items-center justify-center gap-2 min-h-[44px]"
        >
          <ExternalLink className="w-4 h-4" />
          {t.goToAddGames || (isAr ? 'إضافة ألعاب جديدة من G2Bulk' : 'Add new games from G2Bulk')}
        </button>
      </div>
    </Modal>
  );
}
