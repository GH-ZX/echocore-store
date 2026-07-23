import { supabase } from './supabase';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const PROFILE_CORE_SELECT = 'name, role, balance, created_at, avatar_url, bio, username, username_changed_at, gender, date_of_birth';
export const PROFILE_EXTENDED_SELECT = 'phone, country, favorite_game, discord_username, default_player_uid, game_player_uids';
export const PROFILE_SELECT = `${PROFILE_CORE_SELECT}, ${PROFILE_EXTENDED_SELECT}`;

export const PROFILE_FIELD_LIMITS = {
  name: 40,
  bio: 160,
  phone: 20,
  country: 60,
  favorite_game: 80,
  discord_username: 40,
  default_player_uid: 40,
};

export const PROFILE_GENDERS = ['male', 'female'];

const EXTENDED_FIELD_KEYS = Object.keys(PROFILE_FIELD_LIMITS).filter(
  (key) => !['name', 'bio'].includes(key),
);

const LEGACY_COLUMN_PATTERN = /avatar_url|bio|phone|country|favorite_game|discord_username|default_player_uid|gender|date_of_birth|column/i;

/** Normalize optional gender: male | female | null */
export function normalizeProfileGender(value) {
  const g = String(value || '').trim().toLowerCase();
  if (g === 'male' || g === 'female') return g;
  return null;
}

/** Validate optional ISO date (YYYY-MM-DD). Returns { ok, value|null, code? } */
export function normalizeProfileDateOfBirth(value) {
  const raw = String(value || '').trim();
  if (!raw) return { ok: true, value: null };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, code: 'date_of_birth_invalid', value: null };
  }
  const date = new Date(`${raw}T00:00:00`);
  if (!Number.isFinite(date.getTime())) {
    return { ok: false, code: 'date_of_birth_invalid', value: null };
  }
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  if (date > today) {
    return { ok: false, code: 'date_of_birth_future', value: null };
  }
  const min = new Date();
  min.setFullYear(min.getFullYear() - 120);
  if (date < min) {
    return { ok: false, code: 'date_of_birth_invalid', value: null };
  }
  return { ok: true, value: raw };
}

/** Max date string for <input type="date"> (today). */
export function getDateOfBirthMax() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Default calendar open year ~16 years ago (common for gamers). */
export function getDateOfBirthDefaultOpen() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 16);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function getDateOfBirthMin() {
  const d = new Date();
  d.setFullYear(d.getFullYear() - 120);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function validateProfileAvatarFile(file) {
  if (!file) return { ok: false, message: 'No file selected' };
  if (!AVATAR_TYPES.has(file.type)) {
    return { ok: false, message: 'Use JPG, PNG, WebP, or GIF' };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, message: 'Image must be under 2 MB' };
  }
  return { ok: true };
}

export async function uploadProfileAvatar(userId, file) {
  const check = validateProfileAvatarFile(file);
  if (!check.ok) throw new Error(check.message);

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const safeExt = ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg';
  const fileName = `avatars/${userId}-${Date.now()}.${safeExt}`;

  const { error } = await supabase.storage
    .from('product-images')
    .upload(fileName, file, { upsert: true, cacheControl: '3600' });

  if (error) {
    throw new Error(error.message || 'Avatar upload failed');
  }

  const { data: { publicUrl } } = supabase.storage
    .from('product-images')
    .getPublicUrl(fileName);

  return publicUrl;
}

function trimField(value, max) {
  return String(value ?? '').trim().slice(0, max);
}

function buildProfilePayload(patch = {}) {
  const payload = {};

  if (patch.name != null) {
    const trimmed = trimField(patch.name, PROFILE_FIELD_LIMITS.name);
    if (!trimmed) throw new Error('Name is required');
    payload.name = trimmed;
  }

  if (patch.bio != null) {
    payload.bio = trimField(patch.bio, PROFILE_FIELD_LIMITS.bio);
  }

  if (patch.avatar_url !== undefined) {
    payload.avatar_url = patch.avatar_url || null;
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'gender')) {
    payload.gender = normalizeProfileGender(patch.gender);
  }

  if (Object.prototype.hasOwnProperty.call(patch, 'date_of_birth')) {
    const dob = normalizeProfileDateOfBirth(patch.date_of_birth);
    if (!dob.ok) throw new Error(dob.code || 'date_of_birth_invalid');
    payload.date_of_birth = dob.value;
  }

  for (const key of EXTENDED_FIELD_KEYS) {
    if (key === 'game_player_uids') continue;
    if (patch[key] != null) {
      payload[key] = trimField(patch[key], PROFILE_FIELD_LIMITS[key]) || null;
    }
  }

  // JSON map of per-game saved player UIDs (not a string field)
  if (Object.prototype.hasOwnProperty.call(patch, 'game_player_uids')) {
    const map = patch.game_player_uids;
    payload.game_player_uids = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  }

  return payload;
}

export async function updateUserProfileRecord(userId, patch = {}) {
  const payload = buildProfilePayload(patch);

  if (Object.keys(payload).length === 0) {
    throw new Error('Nothing to update');
  }

  let result = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', userId)
    .select(PROFILE_SELECT)
    .single();

  if (result.error && LEGACY_COLUMN_PATTERN.test(result.error.message || '')) {
    const legacyPayload = { ...payload };
    for (const key of ['avatar_url', 'bio', ...EXTENDED_FIELD_KEYS]) {
      delete legacyPayload[key];
    }
    if (Object.keys(legacyPayload).length === 0) {
      throw new Error('Run supabase_echocore_full.sql to enable profile fields');
    }
    result = await supabase
      .from('profiles')
      .update(legacyPayload)
      .eq('id', userId)
      .select('name, role, balance, created_at')
      .single();
  }

  if (result.error) throw new Error(result.error.message || 'Failed to update profile');
  return result.data;
}

export function getProfileInitials(name = '', email = '') {
  const source = (name || email || '?').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function emptyProfileValue(value) {
  return !String(value ?? '').trim();
}