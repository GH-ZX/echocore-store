import React from 'react';
import AdminEditButton from '../components/admin/AdminEditButton';
import BorderGlow from '../components/ui/BorderGlow';
import { presetImageUrl } from '../lib/imageUtils';

export default function AllGamesView({ 
  games = [], 
  t = {}, 
  lang = 'en', 
  onSelectGame,
  onEditGame,
  isAdmin = false,
  loading = false,
  searchQuery = '',
  onSearchChange: _onSearchChange
}) {
  const isAr = lang === 'ar';

  const filteredGames = searchQuery.trim()
    ? games.filter(g =>
        (g.name_en || '').toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        (g.name_ar || '').toLowerCase().includes(searchQuery.toLowerCase().trim())
      )
    : games;

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8 md:mb-10">
        <h1 className="games-page-title section-heading text-3xl md:text-4xl font-black mb-2">
          {searchQuery.trim() 
            ? (isAr ? t.searchResults || 'نتائج البحث' : t.searchResults || 'Search Results') 
            : (isAr ? t.allGames || 'جميع الألعاب' : t.allGames || 'All Games')}
        </h1>
        <p className="games-page-subtitle section-subheading text-left mx-0 max-w-[50ch]">
          {searchQuery.trim()
            ? (isAr ? `${t.resultsFor || 'نتائج لـ'} "${searchQuery}"` : `${t.resultsFor || 'Results for'} "${searchQuery}"`)
            : (isAr 
              ? t.chooseGame || 'اختر لعبتك المفضلة وابدأ الشحن فوراً' 
              : t.chooseGame || 'Choose your favorite game and start topping up instantly')}
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card h-48 sm:h-52 animate-pulse bg-[var(--bg-surface)]" />
          ))}
        </div>
      ) : filteredGames.length === 0 ? (
        <div className="text-center py-12 text-[var(--text-sec)]">
          {searchQuery.trim()
            ? (isAr ? t.noResults || 'لا توجد نتائج مطابقة.' : t.noResults || 'No games match your search.')
            : (isAr ? t.noGamesAvailable || 'لا توجد ألعاب متاحة حالياً.' : t.noGamesAvailable || 'No games available yet.')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredGames.map((game) => (
            <BorderGlow
              key={game.id}
              edgeSensitivity={25}
              borderRadius={16}
              glowRadius={30}
              glowIntensity={0.8}
              coneSpread={25}
              fillOpacity={0.35}
            >
            <div
              onClick={() => onSelectGame && onSelectGame(game)}
              className="games-card group cursor-pointer transition-all duration-300 active:scale-[0.985]"
            >
              {isAdmin && onEditGame && (
                <div className="absolute top-3 right-3 z-10">
                  <AdminEditButton
                    iconOnly
                    label={t.edit || 'Edit'}
                    onClick={() => onEditGame(game)}
                    className="bg-black/50 backdrop-blur-sm"
                  />
                </div>
              )}
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
            </div>
            </BorderGlow>
          ))}
        </div>
      )}

      <div className="mt-8 text-center">
        <p className="text-sm text-[var(--text-muted)]">
          {isAr 
            ? t.clickAnyGame || 'اضغط على أي لعبة لعرض العروض المتاحة' 
            : t.clickAnyGame || 'Click any game to view available offers'}
        </p>
      </div>
    </div>
  );
}
