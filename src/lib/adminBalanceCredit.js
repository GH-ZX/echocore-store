import { supabase } from './supabase';
import { RECHARGE_MAX } from './recharge';

const SETUP_MSG =
  'Manual balance adjust is not configured. Run scripts/admin-balance-adjust-migration.sql in Supabase.';

const ADJUST_MIN = 0.01;
const ADJUST_MAX = RECHARGE_MAX || 500;

function wrapRpcError(error) {
  if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
    throw new Error(SETUP_MSG);
  }
  throw error;
}

/** Amount for credit or debit (USD). */
export function validateManualCreditAmount(amount) {
  const value = parseFloat(amount);
  if (!Number.isFinite(value)) return { valid: false, value: 0 };
  const rounded = Math.round(value * 100) / 100;
  return {
    valid: rounded >= ADJUST_MIN && rounded <= ADJUST_MAX,
    value: rounded,
  };
}

export function validateShamcashTransactionRef(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return { valid: true, value: '' };
  const valid = /^#[0-9]+$/.test(trimmed);
  return { valid, value: trimmed };
}

export async function adminManualBalanceCredit({
  userId,
  amount,
  reason,
  transactionRef = null,
  rechargeRequestId = null,
}) {
  const { valid, value } = validateManualCreditAmount(amount);
  if (!valid) {
    throw new Error(`Amount must be between $${ADJUST_MIN} and $${ADJUST_MAX}`);
  }

  const reasonTrimmed = String(reason || '').trim();
  if (reasonTrimmed.length < 5) {
    throw new Error('Reason is required');
  }

  const refCheck = validateShamcashTransactionRef(transactionRef);
  if (!refCheck.valid) {
    throw new Error('Transaction reference must start with # followed by digits only');
  }

  const { data, error } = await supabase.rpc('admin_manual_balance_credit', {
    p_user_id: userId,
    p_amount: value,
    p_reason: reasonTrimmed,
    p_transaction_ref: refCheck.value || null,
    p_recharge_request_id: rechargeRequestId || null,
  });

  if (error) wrapRpcError(error);
  return data;
}

/** Credit or debit store wallet balance (admin). */
export async function adminAdjustUserBalance({
  userId,
  amount,
  direction = 'credit',
  reason,
  transactionRef = null,
}) {
  const dir = String(direction || 'credit').toLowerCase() === 'debit' ? 'debit' : 'credit';
  const { valid, value } = validateManualCreditAmount(amount);
  if (!valid) {
    throw new Error(`Amount must be between $${ADJUST_MIN} and $${ADJUST_MAX}`);
  }

  const reasonTrimmed = String(reason || '').trim();
  if (reasonTrimmed.length < 5) {
    throw new Error('Reason is required');
  }

  const refCheck = validateShamcashTransactionRef(transactionRef);
  if (!refCheck.valid) {
    throw new Error('Transaction reference must start with # followed by digits only');
  }

  const { data, error } = await supabase.rpc('admin_adjust_user_balance', {
    p_user_id: userId,
    p_amount: value,
    p_direction: dir,
    p_reason: reasonTrimmed,
    p_transaction_ref: refCheck.value || null,
  });

  if (error) wrapRpcError(error);
  return data;
}

export { ADJUST_MIN, ADJUST_MAX };
