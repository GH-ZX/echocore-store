import { supabase } from './supabase';

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const AVATAR_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const PROFILE_CORE_SELECT = 'name, role, balance, created_at, avatar_url, bio';
export const PROFILE_EXTENDED_SELECT = 'phone, country, favorite_game, discord_username, default_player_uid';
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

const EXTENDED_FIELD_KEYS = Object.keys(PROFILE_FIELD_LIMITS).filter(
  (key) => !['name', 'bio'].includes(key),
);

const LEGACY_COLUMN_PATTERN = /avatar_url|bio|phone|country|favorite_game|discord_username|default_player_uid|column/i;

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

  for (const key of EXTENDED_FIELD_KEYS) {
    if (patch[key] != null) {
      payload[key] = trimField(patch[key], PROFILE_FIELD_LIMITS[key]) || null;
    }
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
      throw new Error('Run supabase_profile_extended_migration.sql to enable profile fields');
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