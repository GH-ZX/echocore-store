import { supabase } from './supabase';

const DEV_RPC_MSG =
  'Developer tools are not configured. Run supabase_notifications_v2/v3 migrations in Supabase.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

export const isMockFulfillmentEnabled = () => (
  import.meta.env.VITE_MOCK_FULFILLMENT === 'true'
);

export async function adminGetDevWallet() {
  const { data, error } = await supabase.rpc('admin_get_dev_wallet');
  if (error) {
    if (isMissingRpc(error)) throw new Error(DEV_RPC_MSG);
    throw error;
  }
  return data;
}

export async function adminCreditTestBalance(amount = 100) {
  const { data, error } = await supabase.rpc('admin_credit_test_balance', {
    p_amount: amount,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(DEV_RPC_MSG);
    throw error;
  }
  return data;
}

export async function adminClearTestBalance() {
  const { data, error } = await supabase.rpc('admin_clear_test_balance');
  if (error) {
    if (isMissingRpc(error)) throw new Error(DEV_RPC_MSG);
    throw error;
  }
  return data;
}

export async function adminRunMockPurchase(offerId, mockCode = null) {
  const { data, error } = await supabase.rpc('admin_run_mock_purchase', {
    p_offer_id: offerId,
    p_mock_code: mockCode?.trim() || null,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(DEV_RPC_MSG);
    throw error;
  }
  return data;
}

export async function adminMockFulfillOrder(orderId, mockCode = null) {
  const { data, error } = await supabase.rpc('admin_mock_fulfill_order', {
    p_order_id: orderId,
    p_mock_code: mockCode,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(DEV_RPC_MSG);
    throw error;
  }
  return data;
}

