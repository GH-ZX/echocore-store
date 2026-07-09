import { supabase } from './supabase';

const DEV_RPC_MSG =
  'Developer tools are not configured. Run supabase_notifications_v2_migration.sql in Supabase.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

export const isMockFulfillmentEnabled = () => (
  import.meta.env.VITE_MOCK_FULFILLMENT === 'true'
);

/** Admin: add test balance without a real recharge payment */
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

/** Admin: mark an order fulfilled with a mock redeem code (no G2Bulk API call) */
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