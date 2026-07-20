import { supabase } from './supabase';
import { validateUsername } from './username';

const SETUP_MSG = 'Run supabase_username_change_migration.sql in the Supabase SQL Editor.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

function mapUsernameError(error) {
  if (isMissingRpc(error)) throw new Error(SETUP_MSG);
  const message = String(error?.message || '').trim();
  if (message === 'username_cooldown'
    || message === 'username_taken'
    || message === 'username_invalid'
    || message === 'username_unchanged') {
    throw new Error(message);
  }
  throw error;
}

export async function changeUsername(newUsername) {
  const { data, error } = await supabase.rpc('change_username', {
    p_new_username: String(newUsername || '').trim(),
  });
  if (error) mapUsernameError(error);
  return data;
}

export async function adminChangeUsername(userId, newUsername) {
  const { data, error } = await supabase.rpc('admin_change_username', {
    p_user_id: userId,
    p_new_username: String(newUsername || '').trim(),
  });
  if (error) mapUsernameError(error);
  return data;
}

/**
 * Check if a username can be claimed (signup / profile).
 * @returns {{ available: boolean, empty?: boolean, reason?: string, username?: string }}
 */
export async function checkUsernameAvailable(username) {
  const local = String(username || '').trim();
  if (!local) {
    return { available: true, empty: true, username: '' };
  }
  const format = validateUsername(local);
  if (!format.ok) {
    return { available: false, reason: format.code || 'username_invalid', username: format.value || local };
  }

  const { data, error } = await supabase.rpc('check_username_available', {
    p_username: format.value,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(SETUP_MSG);
    throw error;
  }
  if (data && typeof data === 'object') {
    return {
      available: !!data.available,
      empty: !!data.empty,
      reason: data.reason || null,
      username: data.username || format.value,
    };
  }
  return { available: true, username: format.value };
}

export function getUsernameErrorMessage(code, t = {}) {
  const map = {
    username_cooldown: t.usernameCooldown,
    username_taken: t.usernameTaken,
    username_invalid: t.usernameInvalid,
    username_unchanged: t.usernameUnchanged,
  };
  return map[code] || t.profileSaveFailed || code;
}