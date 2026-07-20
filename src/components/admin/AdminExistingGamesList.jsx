import { useMemo, useState } from 'react';
import { Edit } from 'lucide-react';

function matchesFilter(game, filterId) {
  switch (filterId) {
    case 'topup':
      return game.redemption_method === 'uid' || game.redemption_method === 'both' || !game.redemption_method;
    case 'redeem':
      return game.redemption_method === 'redeem_code';
    default:
      return true;
  }
}

function matchesSearch(game, query) {
  if (!query) return true;
  const haystack = [
    game.name_en,
    game.name_ar,
    game.slug,
    game.points_name,
    game.region_label,
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

export default function AdminExistingGamesList({
  games = [],
  offers = [],
  lang = 'ar',
  t = {},
  editingGameId = null,
  onEdit,
  onDelete: _onDelete,
}) {
  const isAr = lang === 'ar';
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const offerCountByGame = useMemo(() => {
    const map = new Map();
    offers.forEach((offer) => {
      if (offer.active === false || !offer.game_id) return;
      map.set(offer.game_id, (map.get(offer.game_id) || 0) + 1);
    });
    return map;
  }, [offers]);

  const filteredGames = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...games]
      .filter((game) => matchesFilter(game, filter) && matchesSearch(game, query))
      .sort((a, b) => String(a.name_en || '').localeCompare(String(b.name_en || ''), undefined, { sensitivity: 'base' }));
  }, [games, filter, search]);

  if (games.length === 0) {
    return <div className="text-[var(--text-sec)]">{t.noGamesYet}</div>;
  }

  return (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <span className="font-bold">
            {filteredGames.length} {t.existingGames}
          </span>
          {(filter !== 'all' || search) && (
            <span className="text-xs text-[var(--text-sec)] ml-2">{t.filtered}</span>
          )}
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.searchGamesPlaceholder}
            className="input text-xs py-2 w-full sm:w-44 min-w-0"
          />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input text-xs py-2 w-full sm:w-auto min-w-0"
          >
            <option value="all">{t.allGamesOption}</option>
            <option value="topup">{t.filterTopup}</option>
            <option value="redeem">{t.filterRedeem}</option>
          </select>
        </div>
      </div>

      <div className="space-y-2 max-h-[60rem] overflow-auto pr-1">
        {filteredGames.length > 0 ? (
          filteredGames.map((game) => {
            const displayName = isAr
              ? (game.name_ar || game.name_en)
              : (game.name_en || game.name_ar);
            const packCount = offerCountByGame.get(game.id) || 0;
            const img = game.image_url || game.logo_url;
            const isEditing = editingGameId === game.id;

            return (
              <div
                key={game.id}
                className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-[var(--bg-primary)] rounded-2xl border group ${
                  isEditing
                    ? 'border-[var(--accent)]/50'
                    : 'border-[var(--border)] hover:border-[var(--accent)]/40'
                }`}
              >
                {img && (
                  <img
                    src={img}
                    alt=""
                    className="w-12 h-12 object-cover rounded-xl flex-shrink-0 border border-[var(--border)]"
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{displayName}</div>
                  <div className="text-xs text-[var(--text-muted)] flex gap-2 flex-wrap">
                    <span className="text-[var(--accent)]">{game.slug}</span>
                    {game.points_name && <span>{game.points_name}</span>}
                    {packCount > 0 && (
                      <span>
                        {packCount} {t.packsShort}
                      </span>
                    )}
                    {game.redemption_method === 'redeem_code' && (
                      <span className="px-1 py-0.5 bg-violet-500/10 text-violet-300 rounded text-[10px]">
                        {t.redemptionCode || t.filterRedeem}
                      </span>
                    )}
                    {game.redemption_method === 'uid' && (
                      <span className="px-1 py-0.5 bg-cyan-500/10 text-cyan-300 rounded text-[10px]">
                        {t.redemptionUid || t.filterTopup}
                      </span>
                    )}
                    {game.region_label && <span>• {game.region_label}</span>}
                    {game.show_in_carousel && (
                      <span className="px-1 py-0.5 bg-amber-500/10 text-amber-300 rounded text-[10px]">
                        {t.gameBadgeCarousel}
                      </span>
                    )}
                    {game.active === false && (
                      <span className="px-1 py-0.5 bg-red-500/10 text-red-400 rounded text-[10px]">
                        {t.gameBadgeInactive}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1 self-end sm:self-auto opacity-100 sm:opacity-60 sm:group-hover:opacity-100 transition-opacity">
                  <button
                    type="button"
                    onClick={() => onEdit?.(game)}
                    className="p-2 text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-xl"
                    title={t.edit}
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-[var(--text-sec)]">
            {t.noGamesMatchFilter}
          </div>
        )}
      </div>
    </>
  );
}
