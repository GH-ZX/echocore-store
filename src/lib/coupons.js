import { supabase } from './supabase';

const SETUP_MSG =
  'Coupons are not configured. Run scripts/partner-notifs-coupons-migration.sql in Supabase.';

function wrapRpcError(error) {
  if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
    throw new Error(SETUP_MSG);
  }
  throw error;
}

export async function adminCreateInfluencerCoupon({
  code,
  amountUsd,
  maxRedemptions = null,
  perUserLimit = 1,
  expiresAt = null,
  note = '',
} = {}) {
  const { data, error } = await supabase.rpc('admin_create_influencer_coupon', {
    p_code: code,
    p_amount_usd: Number(amountUsd),
    p_max_redemptions: maxRedemptions == null || maxRedemptions === ''
      ? null
      : Number(maxRedemptions),
    p_per_user_limit: Number(perUserLimit) || 1,
    p_expires_at: expiresAt || null,
    p_note: note || null,
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
  const { data, error } = await supabase.rpc('admin_set_influencer_coupon_active', {
    p_coupon_id: couponId,
    p_is_active: !!isActive,
  });
  if (error) wrapRpcError(error);
  return data;
}

export async function redeemInfluencerCoupon(code) {
  const { data, error } = await supabase.rpc('redeem_influencer_coupon', {
    p_code: String(code || '').trim(),
  });
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('coupon_invalid')) throw new Error('coupon_invalid');
    if (msg.includes('coupon_inactive')) throw new Error('coupon_inactive');
    if (msg.includes('coupon_expired')) throw new Error('coupon_expired');
    if (msg.includes('coupon_exhausted')) throw new Error('coupon_exhausted');
    if (msg.includes('coupon_already_used')) throw new Error('coupon_already_used');
    wrapRpcError(error);
  }
  return data;
}

export function couponErrorMessage(code, t = {}) {
  const map = {
    coupon_invalid: t.couponInvalid,
    coupon_inactive: t.couponInactive,
    coupon_expired: t.couponExpired,
    coupon_exhausted: t.couponExhausted,
    coupon_already_used: t.couponAlreadyUsed,
  };
  return map[code] || t.couponRedeemFailed || code;
}
