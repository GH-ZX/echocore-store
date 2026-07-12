import { Ticket, Gamepad2 } from 'lucide-react';
import AdminEditButton from '../admin/AdminEditButton';
import BorderGlow from './BorderGlow';
import { presetImageUrl } from '../../lib/imageUtils';
import { isVoucherGame } from '../../lib/catalogUtils';
import { brandUserText } from '../../lib/branding';

export default function HomeGameCard({
  game,
  lang,
  t = {},
  description = '',
  variant,
  offerCount,
  packCount,
  teaser = false,
  onSelectGame,
  onEditGame,
  isAdmin = false,
  className = '',
}) {
  const isAr = lang === 'ar';
  const isVoucher = variant === 'voucher'
    || variant === 'account'
    || isVoucherGame(game);
  const regionCount = Number(game.variant_count || game.region_count || 0);
  const hasRegions = !isVoucher && regionCount > 1;
  const packs = packCount ?? offerCount;
  if (!game) return null;

  const gameName = brandUserText(isAr ? game.name_ar : game.name_en);

  const metaLabel = isVoucher
    ? (packs != null
      ? `${packs} ${isAr ? (t.voucherPacks || 'باقة') : (t.voucherPacks || 'packs')}`
      : null)
    : hasRegions
      ? (isAr
        ? `${regionCount} ${t.regionsBadge || 'مناطق'}`
        : `${regionCount} ${t.regionsBadge || 'regions'}`)
      : (packs != null
        ? `${packs} ${isAr ? (t.voucherPacks || 'باقة') : (t.voucherPacks || 'packs')}`
        : `${game.points_name || 'Top-up'} ${isAr ? 'شحن' : 'top-ups'}`);

  const handleOpen = () => {
    if (!teaser) onSelectGame?.(game);
  };

  return (
    <BorderGlow
      edgeSensitivity={25}
      borderRadius={16}
      glowRadius={30}
      glowIntensity={0.8}
      coneSpread={25}
      fillOpacity={0.35}
      className={className}
    >
      <div
        onClick={handleOpen}
        className={`storefront-card home-game-card group flex flex-col transition-all duration-300 ${
          teaser
            ? 'storefront-card--teaser home-game-card--teaser pointer-events-none select-none'
            : 'cursor-pointer active:scale-[0.99]'
        }`}
        aria-hidden={teaser || undefined}
        tabIndex={teaser ? -1 : undefined}
      >
        <div className="relative aspect-[16/10] sm:aspect-[4/3] overflow-hidden bg-[var(--bg-elevated)] flex-shrink-0">
          {game.image_url ? (
            <img
              src={presetImageUrl(game.image_url, 'cardCover')}
              alt={gameName}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-[var(--bg-elevated)] to-[var(--bg-primary)]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

          <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              {isVoucher && (
                <span
                  className="home-game-card-badge home-game-card-badge--icon home-game-card-badge--voucher"
                  aria-label={t.giftCards || (isAr ? 'بطاقات وقسائم' : 'Gift cards & vouchers')}
                >
                  <Ticket className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              )}
              {!isVoucher && (
                <span
                  className="home-game-card-badge home-game-card-badge--icon home-game-card-badge--game"
                  aria-label={t.game || (isAr ? 'لعبة' : 'Game')}
                >
                  <Gamepad2 className="w-3.5 h-3.5" aria-hidden="true" />
                </span>
              )}
            </div>
            {isAdmin && onEditGame && !teaser && (
              <AdminEditButton
                iconOnly
                label={t.edit || 'Edit'}
                onClick={() => onEditGame(game)}
                className="bg-black/50 backdrop-blur-sm"
              />
            )}
          </div>
        </div>

        <div className="storefront-card__body flex flex-col flex-1 p-3 sm:p-3.5 gap-1.5 min-w-0">
          <h3 className="font-semibold text-sm sm:text-base leading-snug text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem]">
            {gameName}
          </h3>
          {description && (
            <p className="text-[11px] sm:text-xs text-[var(--text-sec)] line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
          {metaLabel && (
            <p className="text-[11px] sm:text-xs text-[var(--text-muted)] truncate mt-auto inline-flex items-center gap-1">
              {!isVoucher && <Gamepad2 className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
              {metaLabel}
            </p>
          )}
        </div>
      </div>
    </BorderGlow>
  );
}