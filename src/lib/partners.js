import { supabase } from './supabase';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

export async function fetchMyPartnerTier() {
  const { data, error } = await supabase.rpc('get_my_partner_tier');
  if (error) {
    if (isMissingRpc(error)) return null;
    console.warn('get_my_partner_tier', error.message);
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  return {
    id: data.id,
    slug: data.slug,
    nameEn: data.nameEn || data.name_en,
    nameAr: data.nameAr || data.name_ar,
    markupPercent: Number(data.markupPercent ?? data.markup_percent),
  };
}

export async function fetchPartnerTiers() {
  const { data, error } = await supabase
    .from('partner_tiers')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function adminUpsertPartnerTier(payload = {}) {
  const { data, error } = await supabase.rpc('admin_upsert_partner_tier', {
    p_id: payload.id || null,
    p_slug: payload.slug,
    p_name_en: payload.nameEn,
    p_name_ar: payload.nameAr,
    p_markup_percent: Number(payload.markupPercent),
    p_is_active: payload.isActive !== false,
    p_sort_order: Number(payload.sortOrder) || 0,
  });
  if (error) throw error;
  return data;
}

export async function adminSetUserPartnerTier(userId, tierId = null) {
  const { data, error } = await supabase.rpc('admin_set_user_partner_tier', {
    p_user_id: userId,
    p_tier_id: tierId,
  });
  if (error) throw error;
  return data;
}

/** Soft-delete: deactivates tier (DB-backed; not hardcoded). */
export async function adminDeletePartnerTier(tierId) {
  const { data, error } = await supabase.rpc('admin_delete_partner_tier', {
    p_tier_id: tierId,
  });
  if (error) throw error;
  return data;
}

export async function adminCreatePartnerInvite({ tierId, minutes = 15, note = '' } = {}) {
  const { data, error } = await supabase.rpc('admin_create_partner_invite', {
    p_tier_id: tierId,
    p_minutes: minutes,
    p_note: note || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchRecentPartnerInvites(limit = 20) {
  const { data, error } = await supabase
    .from('partner_invites')
    .select('id, token, tier_id, note, expires_at, used_at, used_by, created_at, partner_tiers(slug, name_en, name_ar, markup_percent)')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function acceptPartnerInvite(token) {
  const { data, error } = await supabase.rpc('accept_partner_invite', {
    p_token: String(token || '').trim(),
  });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('invite_expired')) throw new Error('invite_expired');
    if (msg.includes('invite_used')) throw new Error('invite_used');
    if (msg.includes('invite_invalid')) throw new Error('invite_invalid');
    throw error;
  }
  return data;
}

export function partnerInviteErrorMessage(code, t = {}) {
  const map = {
    invite_expired: t.partnerInviteExpired,
    invite_used: t.partnerInviteUsed,
    invite_invalid: t.partnerInviteInvalid,
  };
  return map[code] || t.partnerInviteFailed || code;
}

export function formatPartnerTierLabel(tier, lang = 'ar') {
  if (!tier) return '';
  return lang === 'ar'
    ? (tier.nameAr || tier.name_ar || tier.slug)
    : (tier.nameEn || tier.name_en || tier.slug);
}
