export function isUserBanned(user) {
  if (!user?.bannedAt) return false;
  if (!user.banExpiresAt) return true;
  return new Date(user.banExpiresAt).getTime() > Date.now();
}

export function isBanPermanent(user) {
  return isUserBanned(user) && !user?.banExpiresAt;
}

export function mapProfileBanFields(profile = {}) {
  return {
    bannedAt: profile.banned_at || null,
    banExpiresAt: profile.ban_expires_at || null,
    banReason: profile.ban_reason || '',
    verifiedAt: profile.verified_at || null,
  };
}