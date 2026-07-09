import { presetImageUrl } from '../../lib/imageUtils';

export default function CatalogHero({
  imageUrl,
  logoUrl,
  title,
  subtitle,
  meta,
  badges = [],
  compact = false,
}) {
  const heightClass = compact ? 'h-48 sm:h-56 md:h-64' : 'h-56 sm:h-72 md:h-80';

  return (
    <section className={`catalog-hero card overflow-hidden mb-6 sm:mb-8 ${compact ? 'catalog-hero--compact' : ''}`}>
      <div className={`relative ${heightClass}`}>
        {imageUrl ? (
          <img
            src={presetImageUrl(imageUrl, 'heroCover')}
            alt=""
            loading="eager"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-primary)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/35 via-transparent to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 md:p-8">
          <div className="flex items-end gap-4">
            {logoUrl && (
              <img
                src={logoUrl}
                alt=""
                className="hidden sm:block w-14 h-14 md:w-16 md:h-16 object-contain rounded-xl bg-black/35 border border-white/10 p-1.5 shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  {badges.map((badge) => (
                    <span
                      key={badge.label}
                      className={`catalog-hero__badge text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md border ${badge.className || ''}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </div>
              )}
              <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight">
                {title}
              </h1>
              {subtitle && (
                <p className="text-white/75 text-sm sm:text-base mt-1.5">{subtitle}</p>
              )}
              {meta && (
                <p className="text-white/45 text-xs sm:text-sm mt-1">{meta}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}