import { supabase } from './supabase';

const SETUP_MSG = 'Run supabase_moderation_migration.sql in the Supabase SQL Editor.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

function wrapRpcError(error) {
  if (isMissingRpc(error)) throw new Error(SETUP_MSG);
  throw error;
}

function isRowBanned(user) {
  if (!user?.banned_at) return false;
  if (!user.ban_expires_at) return true;
  return new Date(user.ban_expires_at).getTime() > Date.now();
}

function applyClientUserFilters(rows, { balanceFilter = 'all', statusFilter = 'all' } = {}) {
  let list = Array.isArray(rows) ? rows : [];
  const bal = String(balanceFilter || 'all').toLowerCase();
  if (bal === 'positive') list = list.filter((u) => Number(u?.balance || 0) > 0);
  if (bal === 'zero') list = list.filter((u) => Number(u?.balance || 0) === 0);

  const status = String(statusFilter || 'all').toLowerCase();
  if (status === 'verified') list = list.filter((u) => !!u?.verified_at);
  if (status === 'unverified') list = list.filter((u) => !u?.verified_at);
  if (status === 'banned') list = list.filter((u) => isRowBanned(u));
  if (status === 'active') list = list.filter((u) => !isRowBanned(u));
  return list;
}

function normalizeAdminUsersResult(data, {
  balanceFilter = 'all',
  statusFilter = 'all',
  applyClientFilters = false,
} = {}) {
  let rows;
  let total;
  if (Array.isArray(data)) {
    rows = data;
    total = data.length;
  } else {
    rows = Array.isArray(data?.rows) ? data.rows : [];
    const t = Number(data?.total);
    total = Number.isFinite(t) ? t : rows.length;
  }
  if (applyClientFilters) {
    rows = applyClientUserFilters(rows, { balanceFilter, statusFilter });
    total = rows.length;
  }
  return { rows, total };
}

/**
 * List storefront users (role=user).
 * @returns {{ rows: object[], total: number }}
 */
export async function fetchAdminUsers(search = '', limit = 50, offset = 0, {
  orderBy = 'created_at',
  balanceFilter = 'all',
  statusFilter = 'all',
} = {}) {
  const bal = balanceFilter || 'all';
  const status = statusFilter || 'all';
  const payload = {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
    p_order_by: orderBy,
    p_balance_filter: bal,
    p_status_filter: status,
  };
  const primary = await supabase.rpc('admin_list_users', payload);
  if (!primary.error) {
    return normalizeAdminUsersResult(primary.data, { balanceFilter: bal, statusFilter: status });
  }

  // Fallback without status filter
  const mid = await supabase.rpc('admin_list_users', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
    p_order_by: orderBy,
    p_balance_filter: bal,
  });
  if (!mid.error) {
    return normalizeAdminUsersResult(mid.data, {
      balanceFilter: bal,
      statusFilter: status,
      applyClientFilters: status !== 'all',
    });
  }

  const older = await supabase.rpc('admin_list_users', {
    p_search: search,
    p_limit: limit,
    p_offset: offset,
    p_order_by: orderBy,
  });
  if (!older.error) {
    return normalizeAdminUsersResult(older.data, {
      balanceFilter: bal,
      statusFilter: status,
      applyClientFilters: true,
    });
  }

  const legacy = await supabase.rpc('admin_list_users', {
    p_search: search,
    p_limit: limit,
  });
  if (legacy.error) wrapRpcError(primary.error);
  return normalizeAdminUsersResult(
    Array.isArray(legacy.data) ? legacy.data : (legacy.data?.rows || []),
    { balanceFilter: bal, statusFilter: status, applyClientFilters: true },
  );
}

/** Admin: wallet ledger for one user (purchase / recharge / refund / adjustment). */
export async function fetchAdminUserTransactions(userId, { limit = 100 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, amount, balance_after, payment_method, reference, status, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(200, Math.max(1, limit)));
  if (error) throw error;
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

/** Thank-you blast to verified customers only. */
export async function adminNotifyVerifiedUsers({ title, body, link = '/profile' } = {}) {
  const { data, error } = await supabase.rpc('admin_notify_verified_users', {
    p_title: title,
    p_body: body,
    p_link: link || null,
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

/** Admin: update customer profile fields (name, contact, bio, UIDs). */
export async function adminUpdateUserProfile(userId, fields = {}) {
  const { data, error } = await supabase.rpc('admin_update_user_profile', {
    p_user_id: userId,
    p_name: fields.name ?? null,
    p_phone: fields.phone ?? null,
    p_country: fields.country ?? null,
    p_bio: fields.bio ?? null,
    p_discord_username: fields.discord_username ?? null,
    p_favorite_game: fields.favorite_game ?? null,
    p_default_player_uid: fields.default_player_uid ?? null,
  });
  if (error) wrapRpcError(error);
  return data;
}