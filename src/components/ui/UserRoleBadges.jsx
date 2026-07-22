import { Handshake, Crown, Megaphone, Sparkles } from 'lucide-react';
import { formatPartnerTierLabel } from '../../lib/partners';

/**
 * Status badges: verified, partner/reseller, super (animated), influencer.
 * size: 'sm' | 'md'
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
  const slug = String(partnerTier?.slug || '').toLowerCase();
  const isSuper = !!partnerTier && (slug === 'super' || slug.includes('super'));
  const isPartner = !!partnerTier && !isSuper;
  const partnerLabel = partnerTier
    ? (formatPartnerTierLabel(partnerTier, lang) || t.badgeReseller || t.badgePartner || 'Partner')
    : '';

  const sizeClass = size === 'sm' ? 'profile-badge--sm' : '';

  return (
    <div className={`user-role-badges ${className}`.trim()}>
      {showPlayer && !isAdmin && (
        <span className={`profile-badge profile-badge--player ${sizeClass}`}>
          <span className="profile-badge__icon" aria-hidden="true">🎮</span>
          {t.profileRolePlayer}
        </span>
      )}
      {isAdmin && (
        <span className={`profile-badge profile-badge--admin ${sizeClass}`}>
          <span className="profile-badge__icon" aria-hidden="true">🛡️</span>
          {t.profileRoleAdmin}
        </span>
      )}
      {verified && !isAdmin && (
        <span className={`profile-badge profile-badge--verified ${sizeClass}`}>
          <Sparkles className="w-3 h-3" aria-hidden="true" />
          {t.verifiedGamer}
        </span>
      )}
      {isSuper && (
        <span
          className={`profile-badge profile-badge--super profile-badge--super-animated ${sizeClass}`}
          title={partnerLabel}
        >
          <Crown className="w-3 h-3 profile-badge__super-icon" aria-hidden="true" />
          <span className="profile-badge__super-label">
            {t.badgeSuper || partnerLabel || 'Super'}
          </span>
          <span className="profile-badge__super-shine" aria-hidden="true" />
        </span>
      )}
      {isPartner && (
        <span className={`profile-badge profile-badge--reseller ${sizeClass}`} title={partnerLabel}>
          <Handshake className="w-3 h-3" aria-hidden="true" />
          {partnerLabel || t.badgeReseller || t.badgePartner}
        </span>
      )}
      {isInfluencer && !isAdmin && (
        <span className={`profile-badge profile-badge--influencer ${sizeClass}`}>
          <Megaphone className="w-3 h-3" aria-hidden="true" />
          {t.badgeInfluencer}
        </span>
      )}
    </div>
  );
}
