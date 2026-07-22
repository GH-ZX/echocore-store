import { useEffect, useState } from 'react';
import { Handshake, Crown, Megaphone, Sparkles } from 'lucide-react';
import { formatPartnerTierLabel } from '../../lib/partners';

/** Frame-driven pixel animation — always moves (not pure CSS). */
function usePixelFrame(frames = 6, ms = 110) {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return undefined;
    }
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % frames);
    }, ms);
    return () => window.clearInterval(id);
  }, [frames, ms]);
  return frame;
}

/**
 * Status badges: verified, partner/reseller, super (pixel fire-rainbow), influencer (pixel fire).
 */
export default function UserRoleBadges({
  t = {},
  lang = 'ar',
  partnerTier = null,
  isInfluencer = false,
  verified = false,
  isAdmin = false,
  size = 'md',
  className = '',
  showPlayer = false,
}) {
  const frame = usePixelFrame(6, 100);
  const slug = String(partnerTier?.slug || '').toLowerCase();
  const isSuper = !!partnerTier && (slug === 'super' || slug.includes('super'));
  const isPartner = !!partnerTier && !isSuper;
  const partnerLabel = partnerTier
    ? (formatPartnerTierLabel(partnerTier, lang) || t.badgeReseller || t.badgePartner || 'Partner')
    : '';

  const sizeClass = size === 'sm' ? 'pixel-badge--sm' : '';

  return (
    <div className={`user-role-badges ${className}`.trim()}>
      {showPlayer && !isAdmin && (
        <span className={`profile-badge profile-badge--player ${size === 'sm' ? 'profile-badge--sm' : ''}`}>
          <span className="profile-badge__icon" aria-hidden="true">🎮</span>
          {t.profileRolePlayer}
        </span>
      )}
      {isAdmin && (
        <span className={`profile-badge profile-badge--admin ${size === 'sm' ? 'profile-badge--sm' : ''}`}>
          <span className="profile-badge__icon" aria-hidden="true">🛡️</span>
          {t.profileRoleAdmin}
        </span>
      )}
      {verified && !isAdmin && (
        <span className={`profile-badge profile-badge--verified ${size === 'sm' ? 'profile-badge--sm' : ''}`}>
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          {t.verifiedGamer}
        </span>
      )}
      {isSuper && (
        <span
          className={`pixel-badge pixel-badge--super pixel-badge--f${frame} ${sizeClass}`}
          title={partnerLabel}
          data-frame={frame}
        >
          <span className="pixel-badge__fire" aria-hidden="true">
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
          </span>
          <span className="pixel-badge__content">
            <Crown className="pixel-badge__icon" aria-hidden="true" strokeWidth={2.5} />
            <span className="pixel-badge__text pixel-badge__text--super">
              {t.badgeSuperHot || t.badgeSuper || 'SUPER'}
            </span>
          </span>
        </span>
      )}
      {isPartner && (
        <span className={`profile-badge profile-badge--reseller ${size === 'sm' ? 'profile-badge--sm' : ''}`} title={partnerLabel}>
          <Handshake className="w-3 h-3" aria-hidden="true" />
          {partnerLabel || t.badgeReseller || t.badgePartner}
        </span>
      )}
      {isInfluencer && !isAdmin && (
        <span
          className={`pixel-badge pixel-badge--influencer pixel-badge--f${frame} ${sizeClass}`}
          data-frame={frame}
        >
          <span className="pixel-badge__fire pixel-badge__fire--inf" aria-hidden="true">
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
            <span className="pixel-badge__col" />
          </span>
          <span className="pixel-badge__content">
            <Megaphone className="pixel-badge__icon" aria-hidden="true" strokeWidth={2.5} />
            <span className="pixel-badge__text pixel-badge__text--influencer">
              {t.badgeInfluencer}
            </span>
          </span>
        </span>
      )}
    </div>
  );
}
