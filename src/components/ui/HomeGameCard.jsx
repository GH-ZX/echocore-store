import AdminEditButton from '../admin/AdminEditButton';
import BorderGlow from './BorderGlow';

export default function HomeGameCard({
  game,
  lang,
  t = {},
  onSelectGame,
  onEditGame,
  isAdmin = false,
}) {
  if (!game) return null;

  return (
    <BorderGlow
      edgeSensitivity={25}
      borderRadius={16}
      glowRadius={30}
      glowIntensity={0.8}
      coneSpread={25}
      fillOpacity={0.35}
    >
    <div
      onClick={() => onSelectGame?.(game)}
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
            src={game.image_url}
            alt={lang === 'ar' ? game.name_ar : game.name_en}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="font-bold text-lg sm:text-xl text-white text-wrap-balance">
            {lang === 'ar' ? game.name_ar : game.name_en}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-xs sm:text-sm text-white/70">
              {game.points_name} {lang === 'ar' ? 'شحن' : 'top-ups'}
            </span>
            <span className="text-[11px] font-semibold text-[var(--accent)] opacity-0 translate-y-1 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
              {lang === 'ar' ? 'عرض' : 'View'}
            </span>
          </div>
        </div>
      </div>
    </div>
    </BorderGlow>
  );
}