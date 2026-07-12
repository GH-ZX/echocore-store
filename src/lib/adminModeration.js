import { supabase } from './supabase';

const SETUP_MSG = 'Run supabase_moderation_migration.sql in the Supabase SQL Editor.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

function wrapRpcError(error) {
  if (isMissingRpc(error)) throw new Error(SETUP_MSG);
  throw error;
}

export async function fetchAdminUsers(search = '', limit = 50) {
  const { data, error } = await supabase.rpc('admin_list_users', {
    p_search: search,
    p_limit: limit,
  });
  if (error) wrapRpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function adminBanUser(userId, reason, expiresAt = null) {
  const { data, error } = await supabase.rpc('admin_ban_user', {
    p_user_id: userId,
    p_reason: reason,
    p_expires_at: expiresAt,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminUnbanUser(userId) {
  const { data, error } = await supabase.rpc('admin_unban_user', {
    p_user_id: userId,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminBroadcastMessage({ kind, title, body, link = null }) {
  const { data, error } = await supabase.rpc('admin_broadcast_message', {
    p_kind: kind,
    p_title: title,
    p_body: body,
    p_link: link,
  });
  if (error) wrapRpcError(error);
  return typeof data === 'number' ? data : 0;
}

export async function adminNotifyUser(userId, { kind, title, body, link = null }) {
  const { data, error } = await supabase.rpc('admin_notify_user', {
    p_user_id: userId,
    p_kind: kind,
    p_title: title,
    p_body: body,
    p_link: link,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminGetUserProfile(userId) {
  const { data, error } = await supabase.rpc('admin_get_user_profile', {
    p_user_id: userId,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminGetUserByUsername(username) {
  const { data, error } = await supabase.rpc('admin_get_user_by_username', {
    p_username: String(username || '').trim().replace(/^@+/, ''),
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function fetchAdminProfileSummaries(userIds = []) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return [];

  const { data, error } = await supabase.rpc('admin_get_profile_summaries', {
    p_user_ids: ids,
  });
  if (error) wrapRpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function adminVerifyUser(userId) {
  const { data, error } = await supabase.rpc('admin_verify_user', {
    p_user_id: userId,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminUnverifyUser(userId) {
  const { data, error } = await supabase.rpc('admin_unverify_user', {
    p_user_id: userId,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminSaveSiteModerationSettings({ requireVerified }) {
  const { data, error } = await supabase.rpc('admin_save_site_moderation_settings', {
    p_require_verified: !!requireVerified,
  });
  if (error) wrapRpcError(error);
  return data;
}

export function isUserRowVerified(row) {
  return !!row?.verified_at;
}

export async function adminSaveMaintenanceSettings({
  enabled,
  messageAr,
  messageEn,
  allowAdmins,
  broadcastNotice = false,
}) {
  const { data, error } = await supabase.rpc('admin_save_maintenance_settings', {
    p_enabled: !!enabled,
    p_message_ar: messageAr || '',
    p_message_en: messageEn || '',
    p_allow_admins: allowAdmins !== false,
  });
  if (error) wrapRpcError(error);

  if (enabled && broadcastNotice) {
    const title = messageAr?.trim() || messageEn?.trim() || 'Maintenance';
    const body = [messageAr, messageEn].filter(Boolean).join('\n\n');
    await adminBroadcastMessage({
      kind: 'maintenance',
      title,
      body,
      link: null,
    });
  }

  return data;
}

export function isUserRowBanned(row) {
  if (!row?.banned_at) return false;
  if (!row.ban_expires_at) return true;
  return new Date(row.ban_expires_at).getTime() > Date.now();
}