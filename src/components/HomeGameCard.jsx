import AdminEditButton from './AdminEditButton';

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
    <div
      onClick={() => onSelectGame?.(game)}
      className="games-card card group overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-[0_25px_50px_-12px_rgb(0,0,0)] active:scale-[0.985] relative"
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
          <div className="font-bold text-lg sm:text-xl text-white">
            {lang === 'ar' ? game.name_ar : game.name_en}
          </div>
          <div className="text-xs sm:text-sm text-white/70 mt-0.5">
            {game.points_name} top-ups
          </div>
        </div>
      </div>
    </div>
  );
}