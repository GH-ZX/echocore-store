const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const USERNAME_MIN_LENGTH = 4;
export const USERNAME_MAX_LENGTH = 20;
export const USERNAME_PATTERN = /^[a-z][a-z0-9]*$/;
/** No wait between changes (server also allows free renames). */
export const USERNAME_COOLDOWN_MS = 0;

export function normalizeUsernameParam(value = '') {
  return String(value || '').trim().replace(/^@+/, '').toLowerCase();
}

export function normalizeUsernameInput(value = '') {
  return normalizeUsernameParam(value).slice(0, USERNAME_MAX_LENGTH);
}

export function validateUsername(value = '') {
  const normalized = normalizeUsernameInput(value);
  if (!normalized) return { ok: false, code: 'username_invalid' };
  if (normalized.length < USERNAME_MIN_LENGTH || normalized.length > USERNAME_MAX_LENGTH) {
    return { ok: false, code: 'username_invalid' };
  }
  if (!USERNAME_PATTERN.test(normalized)) {
    return { ok: false, code: 'username_invalid' };
  }
  return { ok: true, value: normalized };
}

export function getUsernameCooldownEndsAt(changedAt) {
  if (!changedAt) return null;
  const ends = new Date(changedAt).getTime() + USERNAME_COOLDOWN_MS;
  return Number.isFinite(ends) ? new Date(ends) : null;
}

export function canChangeUsername(changedAt, now = Date.now()) {
  const endsAt = getUsernameCooldownEndsAt(changedAt);
  if (!endsAt) return true;
  return endsAt.getTime() <= now;
}

export function getUsernameCooldownRemainingMs(changedAt, now = Date.now()) {
  const endsAt = getUsernameCooldownEndsAt(changedAt);
  if (!endsAt) return 0;
  return Math.max(0, endsAt.getTime() - now);
}

export function isUuidLike(value = '') {
  return UUID_RE.test(String(value || '').trim());
}

export function getProfileUsername(profile) {
  return String(profile?.username || '').trim();
}

export function formatProfileUsername(username) {
  const value = String(username || '').trim();
  if (!value) return '';
  return value.startsWith('@') ? value : `@${value}`;
}

export function getProfileDisplayName(profile, fallback = '') {
  const name = String(profile?.name || '').trim();
  if (name) return name;
  const username = getProfileUsername(profile);
  if (username) return username;
  return fallback;
}

/** Primary label for admin dashboards — prefers @username. */
export function getProfileAdminLabel(profile, fallback = '') {
  const username = getProfileUsername(profile);
  if (username) return formatProfileUsername(username);
  return getProfileDisplayName(profile, fallback);
}

export function profileNamesDiffer(profile) {
  const username = getProfileUsername(profile);
  const name = String(profile?.name || '').trim();
  return !!(username && name && name.toLowerCase() !== username.toLowerCase());
}