import { Ticket, Gamepad2, KeyRound, Globe } from 'lucide-react';
import AdminEditButton from '../admin/AdminEditButton';
import BorderGlow from './BorderGlow';
import { presetImageUrl } from '../../lib/imageUtils';
import { isGamingAccountGame, isGiftCardGame, isVoucherGame } from '../../lib/catalogUtils';
import { brandUserText } from '../../lib/branding';

export default function HomeGameCard({
  game,
  lang,
  t = {},
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
  const isAccount = variant === 'account' || isGamingAccountGame(game);
  const isVoucher = !isAccount && (variant === 'voucher' || isGiftCardGame(game) || isVoucherGame(game));
  const regionCount = Number(game.variant_count || game.region_count || 0);
  const hasRegions = !isVoucher && !isAccount && regionCount > 1;
  const packs = packCount ?? offerCount;
  if (!game) return null;

  const gameName = brandUserText(isAr ? game.name_ar : game.name_en);
  const categoryLabel = isAccount
    ? (t.gamingAccount || (isAr ? 'استرداد' : 'Redeem'))
    : isVoucher
      ? (isAr ? t.giftCards || 'بطاقة هدايا' : t.giftCards || 'Gift card')
      : (isAr ? t.game || 'لعبة' : t.game || 'Game');

  const metaLabel = isAccount
    ? (packs != null
      ? `${packs} ${isAr ? (t.accountPacks || 'خطة') : (t.accountPacks || 'plans')}`
      : (t.redeemMeta || (isAr ? 'كود استرداد للمنصة' : 'Platform redeem code')))
    : isVoucher
      ? (packs != null
        ? `${packs} ${isAr ? (t.voucherPacks || 'باقة') : (t.voucherPacks || 'packs')}`
        : (isAr ? t.voucherBadge || 'كود فوري' : t.voucherBadge || 'Instant code'))
      : hasRegions
        ? (isAr
          ? `${regionCount} ${t.regionsBadge || 'مناطق'}`
          : `${regionCount} ${t.regionsBadge || 'regions'}`)
        : `${game.points_name || 'Top-up'} ${isAr ? 'شحن' : 'top-ups'}`;

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
        className={`home-game-card group flex flex-col transition-all duration-300 ${
          teaser
            ? 'home-game-card--teaser pointer-events-none select-none'
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
              {(isVoucher || isAccount || hasRegions) && (
                <span className={`home-game-card-badge ${
                  isAccount
                    ? 'home-game-card-badge--account'
                    : isVoucher
                      ? 'home-game-card-badge--voucher'
                      : 'home-game-card-badge--regions'
                }`}>
                  {isAccount ? <KeyRound className="w-3 h-3" /> : isVoucher ? <Ticket className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
                  {isAccount
                    ? (t.accountBadge || (isAr ? 'استرداد' : 'Redeem'))
                    : isVoucher
                      ? (t.voucherBadge || (isAr ? 'كود' : 'Code'))
                      : `${regionCount} ${t.regionsBadge || (isAr ? 'مناطق' : 'regions')}`}
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

        <div className="flex flex-col flex-1 p-3 sm:p-3.5 gap-1.5 min-w-0">
          <p className="text-[11px] sm:text-xs text-[var(--text-muted)] truncate font-medium inline-flex items-center gap-1">
            {isAccount ? <KeyRound className="w-3 h-3 flex-shrink-0" /> : isVoucher ? <Ticket className="w-3 h-3 flex-shrink-0" /> : <Gamepad2 className="w-3 h-3 flex-shrink-0" />}
            {categoryLabel}
          </p>
          <h3 className="font-semibold text-sm sm:text-base leading-snug text-[var(--text-primary)] line-clamp-2 min-h-[2.5rem]">
            {gameName}
          </h3>
          <p className="text-[11px] sm:text-xs text-[var(--text-muted)] truncate mt-auto">
            {metaLabel}
          </p>
        </div>
      </div>
    </BorderGlow>
  );
}