import { supabase } from './supabase';

const SETUP_MSG =
  'Influencer coupons are not configured. Run scripts/influencer-referral-coupons-migration.sql in Supabase.';

function wrapRpcError(error) {
  if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
    throw new Error(SETUP_MSG);
  }
  throw error;
}

export async function adminCreateInfluencerCoupon({
  code,
  discountPercent = 3,
  influencerUserId,
  note = '',
  expiresAt = null,
} = {}) {
  const { data, error } = await supabase.rpc('admin_create_influencer_coupon', {
    p_code: code,
    p_discount_percent: Number(discountPercent),
    p_influencer_user_id: influencerUserId,
    p_note: note || null,
    p_expires_at: expiresAt || null,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminUpdateInfluencerCoupon(couponId, patch = {}) {
  const { data, error } = await supabase.rpc('admin_update_influencer_coupon', {
    p_coupon_id: couponId,
    p_discount_percent: patch.discountPercent != null ? Number(patch.discountPercent) : null,
    p_influencer_user_id: patch.influencerUserId || null,
    p_note: patch.note !== undefined ? patch.note : null,
    p_expires_at: patch.expiresAt || null,
    p_is_active: patch.isActive !== undefined ? !!patch.isActive : null,
    p_clear_expires: !!patch.clearExpires,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function adminListInfluencerCoupons(limit = 50) {
  const { data, error } = await supabase.rpc('admin_list_influencer_coupons', {
    p_limit: limit,
  });
  if (error) wrapRpcError(error);
  return Array.isArray(data) ? data : [];
}

export async function adminSetInfluencerCouponActive(couponId, isActive) {
  return adminUpdateInfluencerCoupon(couponId, { isActive: !!isActive });
}

/** Bind referral code to current user (discount on future purchases). */
export async function applyInfluencerCoupon(code) {
  const { data, error } = await supabase.rpc('apply_influencer_coupon', {
    p_code: String(code || '').trim(),
  });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('coupon_invalid')) throw new Error('coupon_invalid');
    if (msg.includes('coupon_inactive')) throw new Error('coupon_inactive');
    if (msg.includes('coupon_expired')) throw new Error('coupon_expired');
    if (msg.includes('coupon_own_code')) throw new Error('coupon_own_code');
    wrapRpcError(error);
  }
  return data;
}

export async function clearMyInfluencerCoupon() {
  const { data, error } = await supabase.rpc('clear_my_influencer_coupon');
  if (error) wrapRpcError(error);
  return data;
}

export async function fetchMyInfluencerCoupon() {
  const { data, error } = await supabase.rpc('get_my_influencer_coupon');
  if (error) {
    if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
      return null;
    }
    console.warn('get_my_influencer_coupon', error.message);
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  return {
    id: data.id,
    code: data.code,
    discountPercent: Number(data.discountPercent ?? data.discount_percent),
    note: data.note || null,
  };
}

export function couponErrorMessage(code, t = {}) {
  const map = {
    coupon_invalid: t.couponInvalid,
    coupon_inactive: t.couponInactive,
    coupon_expired: t.couponExpired,
    coupon_own_code: t.couponOwnCode,
  };
  return map[code] || t.couponApplyFailed || t.couponRedeemFailed || code;
}
