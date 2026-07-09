import { supabase } from './supabase'

const RPC_SETUP_MSG =
  'Checkout is not configured. Run supabase_security_migration.sql in the Supabase SQL Editor.'

function assertRpcData(data, error) {
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error(RPC_SETUP_MSG)
    }
    throw error
  }
  if (!data) {
    throw new Error('Server returned an empty response')
  }
  return data
}

export async function createOrderAtomic({ userId, total, paymentMethod, items }) {
  const { data, error } = await supabase.rpc('create_order_atomic', {
    p_user_id: userId,
    p_total: total,
    p_payment_method: paymentMethod,
    p_items: items,
  })
  return assertRpcData(data, error)
}

export async function confirmOrderPayment(orderId, reference = null) {
  const { data, error } = await supabase.rpc('confirm_order_payment', {
    p_order_id: orderId,
    p_reference: reference,
  })
  return assertRpcData(data, error)
}

export async function creditUserBalance(userId, amount, paymentMethod, reference = null) {
  const { data, error } = await supabase.rpc('credit_user_balance', {
    p_user_id: userId,
    p_amount: amount,
    p_payment_method: paymentMethod,
    p_reference: reference,
  })
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error(RPC_SETUP_MSG)
    }
    throw error
  }
  if (data == null) {
    throw new Error('Failed to credit balance')
  }
  return data
}