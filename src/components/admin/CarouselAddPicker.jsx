import { useMemo, useState } from 'react';
import { X, Search, Plus, ExternalLink } from 'lucide-react';
import { getCarouselPickableGames } from '../../lib/carouselUtils';

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

  const pickableGames = useMemo(() => getCarouselPickableGames(games), [games]);

  const filteredGames = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return pickableGames;
    return pickableGames.filter((game) => {
      const name = String(game.name_en || game.name_ar || '').toLowerCase();
      return name.includes(q);
    });
  }, [pickableGames, query]);

  const gameName = (game) => (isAr ? game.name_ar : game.name_en) || game.name_en || game.name_ar;

  return (
    <div className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        aria-label={isAr ? 'إغلاق' : 'Close'}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative w-full sm:max-w-md max-h-[min(80dvh,520px)] flex flex-col rounded-t-2xl sm:rounded-2xl border border-[var(--border)] bg-[var(--bg-surface)] shadow-2xl overflow-hidden"
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[var(--border)] shrink-0">
          <div className="min-w-0">
            <h2 className="text-base font-bold truncate">
              {t.addToCarousel || (isAr ? 'إضافة إلى الكاروسيل' : 'Add to carousel')}
            </h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              {isAr
                ? 'اختر من الألعاب الموجودة في المتجر فقط'
                : 'Pick from games already in your store'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-white/5 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-2 border-b border-[var(--border)] shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isAr ? 'بحث…' : 'Search…'}
              className="input w-full pl-9 min-h-[40px]"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-2">
          {filteredGames.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-8">
              {pickableGames.length === 0
                ? (isAr
                  ? 'لا توجد ألعاب أخرى في المتجر. أضف ألعاباً من G2Bulk أولاً.'
                  : 'No more store games available. Add games from G2Bulk first.')
                : (isAr ? 'لا توجد نتائج مطابقة.' : 'No matching games.')}
            </p>
          ) : (
            filteredGames.map((game) => (
              <div
                key={game.id}
                className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]"
              >
                {game.logo_url || game.image_url ? (
                  <img
                    src={game.logo_url || game.image_url}
                    alt=""
                    className="w-9 h-9 object-contain rounded shrink-0"
                  />
                ) : (
                  <div className="w-9 h-9 rounded bg-[var(--bg-elevated)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{gameName(game)}</div>
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
            ))
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
      </div>
    </div>
  );
}