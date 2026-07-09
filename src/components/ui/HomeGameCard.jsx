import { Ticket, Gamepad2, UserCircle, Globe } from 'lucide-react';
import AdminEditButton from '../admin/AdminEditButton';
import BorderGlow from './BorderGlow';
import { presetImageUrl } from '../../lib/imageUtils';
import { isGamingAccountGame, isGiftCardGame, isVoucherGame } from '../../lib/catalogUtils';

export default function HomeGameCard({
  game,
  lang,
  t = {},
  variant,
  offerCount,
  onSelectGame,
  onEditGame,
  isAdmin = false,
}) {
  const isAccount = variant === 'account' || isGamingAccountGame(game);
  const isVoucher = !isAccount && (variant === 'voucher' || isGiftCardGame(game) || isVoucherGame(game));
  const regionCount = Number(game.variant_count || game.region_count || 0);
  const hasRegions = !isVoucher && !isAccount && regionCount > 1;
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
            src={presetImageUrl(game.image_url, 'cardCover')}
            alt={lang === 'ar' ? game.name_ar : game.name_en}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          />
        ) : (
          <div className="absolute inset-0 bg-[var(--bg-elevated)]" />
        )}
        <div className={`absolute inset-0 bg-gradient-to-t ${
          isAccount
            ? 'from-sky-950/90 via-sky-900/20'
            : isVoucher
              ? 'from-violet-950/90 via-violet-900/20'
              : 'from-black/70 via-black/30'
        } to-transparent`} />
        {(isVoucher || isAccount || hasRegions) && (
          <div className={`absolute top-3 left-3 z-10 inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold ${
            isAccount
              ? 'bg-sky-500/20 border border-sky-400/30 text-sky-100'
              : isVoucher
                ? 'bg-violet-500/20 border border-violet-400/30 text-violet-100'
                : 'bg-[var(--accent)]/20 border border-[var(--accent)]/30 text-white'
          }`}>
            {isAccount ? <UserCircle className="w-3 h-3" /> : isVoucher ? <Ticket className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
            {lang === 'ar'
              ? (isAccount
                ? (t.accountBadge || 'حساب')
                : isVoucher
                  ? (t.voucherBadge || 'كود')
                  : `${regionCount} ${t.regionsBadge || 'مناطق'}`)
              : (isAccount
                ? (t.accountBadge || 'Account')
                : isVoucher
                  ? (t.voucherBadge || 'Code')
                  : `${regionCount} ${t.regionsBadge || 'regions'}`)}
          </div>
        )}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="font-bold text-lg sm:text-xl text-white text-wrap-balance">
            {lang === 'ar' ? game.name_ar : game.name_en}
          </div>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="text-xs sm:text-sm text-white/70 inline-flex items-center gap-1">
              {isAccount ? (
                <>
                  <UserCircle className="w-3 h-3" />
                  {offerCount != null
                    ? `${offerCount} ${lang === 'ar' ? (t.accountPacks || 'خطة') : (t.accountPacks || 'plans')}`
                    : (lang === 'ar' ? t.gamingAccount || 'حساب ألعاب' : t.gamingAccount || 'Gaming account')}
                </>
              ) : isVoucher ? (
                <>
                  <Ticket className="w-3 h-3" />
                  {offerCount != null
                    ? `${offerCount} ${lang === 'ar' ? (t.voucherPacks || 'باقة') : (t.voucherPacks || 'packs')}`
                    : (lang === 'ar' ? t.giftCard || 'بطاقة هدايا' : t.giftCard || 'Gift card')}
                </>
              ) : (
                <>
                  <Gamepad2 className="w-3 h-3" />
                  {game.points_name} {lang === 'ar' ? 'شحن' : 'top-ups'}
                </>
              )}
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