import { supabase } from './supabase';
import { RECHARGE_MAX, RECHARGE_MIN, validateRechargeAmount } from './recharge';

const SETUP_MSG =
  'Manual balance credit is not configured. Run scripts/admin-manual-balance-credit-migration.sql in Supabase.';

function wrapRpcError(error) {
  if (error?.message?.includes('function') && error?.message?.includes('does not exist')) {
    throw new Error(SETUP_MSG);
  }
  throw error;
}

export function validateManualCreditAmount(amount) {
  return validateRechargeAmount(amount);
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
    throw new Error(`Amount must be between $${RECHARGE_MIN} and $${RECHARGE_MAX}`);
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