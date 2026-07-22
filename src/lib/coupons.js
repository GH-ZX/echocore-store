import { supabase } from './supabase';

const SETUP_MSG =
  'Influencer coupons are not configured. Run scripts/influencer-margin-model-migration.sql in Supabase.';

function wrapRpcError(error) {
  if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
    throw new Error(SETUP_MSG);
  }
  throw error;
}

function mapCouponRow(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    id: data.id,
    code: data.code,
    buyerMarkupPercent: Number(
      data.buyerMarkupPercent ?? data.buyer_markup_percent ?? data.discountPercent ?? 10,
    ),
    influencerMarginPercent: Number(
      data.influencerMarginPercent ?? data.influencer_margin_percent ?? 3,
    ),
    note: data.note || null,
    influencerUserId: data.influencer_user_id || data.influencerUserId || null,
    influencerUsername: data.influencer_username || null,
    influencerName: data.influencer_name || null,
    isActive: data.is_active !== false,
    redemptionCount: Number(data.redemption_count || 0),
    createdAt: data.created_at,
  };
}

export async function adminCreateInfluencerCoupon({
  code,
  buyerMarkupPercent = 10,
  influencerMarginPercent = 3,
  influencerUserId,
  note = '',
  expiresAt = null,
} = {}) {
  const { data, error } = await supabase.rpc('admin_create_influencer_coupon', {
    p_code: code,
    p_buyer_markup_percent: Number(buyerMarkupPercent),
    p_influencer_margin_percent: Number(influencerMarginPercent),
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
    p_buyer_markup_percent: patch.buyerMarkupPercent != null
      ? Number(patch.buyerMarkupPercent)
      : null,
    p_influencer_margin_percent: patch.influencerMarginPercent != null
      ? Number(patch.influencerMarginPercent)
      : null,
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
  return (Array.isArray(data) ? data : []).map(mapCouponRow).filter(Boolean);
}

export async function adminSetInfluencerCouponActive(couponId, isActive) {
  return adminUpdateInfluencerCoupon(couponId, { isActive: !!isActive });
}

/** Buy-page: validate code (loading → ok/error). Does not credit wallet. */
export async function validateInfluencerCoupon(code) {
  const { data, error } = await supabase.rpc('validate_influencer_coupon', {
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
  return mapCouponRow(data);
}

export function couponErrorMessage(code, t = {}) {
  const map = {
    coupon_invalid: t.couponInvalid,
    coupon_inactive: t.couponInactive,
    coupon_expired: t.couponExpired,
    coupon_own_code: t.couponOwnCode,
  };
  return map[code] || t.couponApplyFailed || code;
}

/** Whether current user owns any active influencer referral codes. */
export async function fetchMyInfluencerStatus() {
  const { data, error } = await supabase.rpc('get_my_influencer_status');
  if (error) {
    if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
      return { isInfluencer: false };
    }
    console.warn('get_my_influencer_status', error.message);
    return { isInfluencer: false };
  }
  if (!data || typeof data !== 'object') return { isInfluencer: false };
  return {
    isInfluencer: !!data.isInfluencer,
    codeCount: Number(data.codeCount || 0),
    primaryCode: data.primaryCode || null,
  };
}
