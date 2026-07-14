import { supabase } from './supabase';

const RPC_SETUP_MSG =
  'Recharge is not configured. Run supabase_echocore_full.sql in the Supabase SQL Editor.';

function assertRpcData(data, error) {
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error(RPC_SETUP_MSG);
    }
    throw error;
  }
  return data;
}

export const RECHARGE_MIN = 1;
export const RECHARGE_MAX = 500;
export const RECHARGE_PRESETS = [1, 5, 10, 25, 50, 100];

/** Storefront recharge is for customers only — admins use supplier wallets (Sam site). */
export function canUserRecharge(user) {
  return !!user?.id && user.role !== 'admin';
}

export function validateRechargeAmount(amount) {
  const value = parseFloat(amount);
  if (!Number.isFinite(value)) return { valid: false, value: 0 };
  const rounded = Math.round(value * 100) / 100;
  return {
    valid: rounded >= RECHARGE_MIN && rounded <= RECHARGE_MAX,
    value: rounded,
  };
}

export async function getMyActiveRechargeRequest() {
  const { data, error } = await supabase.rpc('get_my_active_recharge_request');
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      return null;
    }
    throw error;
  }
  return data || null;
}

export async function createRechargeRequest(amount, paymentMethod = 'ShamCash', payCurrency = 'USD') {
  const { valid, value } = validateRechargeAmount(amount);
  if (!valid) {
    throw new Error(`Amount must be between $${RECHARGE_MIN} and $${RECHARGE_MAX}`);
  }

  const { data, error } = await supabase.rpc('create_recharge_request', {
    p_amount: value,
    p_payment_method: paymentMethod,
    p_pay_currency: payCurrency,
  });
  return assertRpcData(data, error);
}

export async function markRechargePaymentSent(requestId) {
  const { data, error } = await supabase.rpc('mark_recharge_payment_sent', {
    p_request_id: requestId,
  });
  return assertRpcData(data, error);
}

// Cancel the caller's own pending/payment_sent recharge. Used by the Sam API
// flow when invoice creation fails, so the user is not locked out by the
// "already have a pending recharge" guard. Owner-only (enforced server-side).
export async function cancelMyRechargeRequest(requestId) {
  const { data, error } = await supabase.rpc('cancel_my_recharge_request', {
    p_request_id: requestId,
  });
  return assertRpcData(data, error);
}

export async function fetchAdminRechargeRequests(status = 'all') {
  const { data, error } = await supabase.rpc('get_admin_recharge_requests', {
    p_status: status,
  });
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error(RPC_SETUP_MSG);
    }
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function approveRechargeRequest(requestId) {
  const { data, error } = await supabase.rpc('approve_recharge_request', {
    p_request_id: requestId,
  });
  return assertRpcData(data, error);
}

export async function rejectRechargeRequest(requestId, note = null) {
  const { data, error } = await supabase.rpc('reject_recharge_request', {
    p_request_id: requestId,
    p_note: note,
  });
  return assertRpcData(data, error);
}