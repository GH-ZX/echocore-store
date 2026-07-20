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

/** Cancel abandoned pending recharges (expired invoice or older than maxAgeMinutes). */
export async function expireStalePendingRecharges(maxAgeMinutes = 20) {
  const { data, error } = await supabase.rpc('expire_stale_pending_recharges', {
    p_max_age_minutes: maxAgeMinutes,
  });
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      return { cancelledPending: 0, skipped: true };
    }
    throw error;
  }
  return data || { cancelledPending: 0 };
}

export async function getMyActiveRechargeRequest() {
  // Drop abandoned pending recharges so users aren't stuck on «already pending»
  try {
    await expireStalePendingRecharges(20);
  } catch {
    /* optional cleanup */
  }

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

export async function fetchAdminRechargeRequests(status = 'all', {
  limit = 25,
  offset = 0,
} = {}) {
  const payload = {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  };
  const primary = await supabase.rpc('get_admin_recharge_requests', payload);
  let data = primary.data;

  // Fallback: older 1-arg RPC returns a plain array (cap 100)
  if (primary.error) {
    const legacy = await supabase.rpc('get_admin_recharge_requests', {
      p_status: status,
    });
    if (legacy.error) {
      if (
        (primary.error.message?.includes('function') && primary.error.message?.includes('does not exist'))
        || (legacy.error.message?.includes('function') && legacy.error.message?.includes('does not exist'))
      ) {
        throw new Error(RPC_SETUP_MSG);
      }
      throw primary.error;
    }
    data = legacy.data;
  }

  if (Array.isArray(data)) {
    const all = data;
    const slice = all.slice(offset, offset + limit);
    return { rows: slice, total: all.length };
  }

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const total = Number(data?.total);
  return {
    rows,
    total: Number.isFinite(total) ? total : rows.length,
  };
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