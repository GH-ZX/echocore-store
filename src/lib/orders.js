import { supabase } from './supabase'

const RPC_SETUP_MSG =
  'Checkout is not configured. Run supabase_echocore_full.sql in the Supabase SQL Editor.'

function assertRpcData(data, error, t = {}) {
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error(RPC_SETUP_MSG)
    }
    const msg = error.message || ''
    if (/insufficient balance/i.test(msg)) {
      throw new Error(t.insufficientBalance || msg)
    }
    throw error
  }
  if (!data) {
    throw new Error('Server returned an empty response')
  }
  return data
}

export async function fetchMyOrderReceipt(orderId) {
  const { data, error } = await supabase.rpc('get_my_order_receipt', {
    p_order_id: orderId,
  })
  if (error) {
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      throw new Error(RPC_SETUP_MSG)
    }
    throw error
  }
  if (!data?.order) return null
  return {
    order: data.order,
    items: Array.isArray(data.items) ? data.items : [],
  }
}

export async function createOrderAtomic({ userId, total, paymentMethod, items, t = {} }) {
  const { data, error } = await supabase.rpc('create_order_atomic', {
    p_user_id: userId,
    p_total: total,
    p_payment_method: paymentMethod,
    p_items: items,
  })
  return assertRpcData(data, error, t)
}

export async function markOrderPaymentSent(orderId) {
  const { data, error } = await supabase.rpc('mark_order_payment_sent', {
    p_order_id: orderId,
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

export async function rejectOrderPayment(orderId, note = null) {
  const { data, error } = await supabase.rpc('reject_order_payment', {
    p_order_id: orderId,
    p_note: note,
  })
  return assertRpcData(data, error)
}

/** Admin: cancel unpaid / stuck orders older than maxAgeMinutes (default 15). */
export async function expireStalePendingOrders(maxAgeMinutes = 15) {
  const { data, error } = await supabase.rpc('expire_stale_pending_orders', {
    p_max_age_minutes: maxAgeMinutes,
  })
  if (error) {
    // Older DBs without migration — ignore so admin orders still load.
    if (error.message?.includes('function') && error.message?.includes('does not exist')) {
      return { cancelledPending: 0, failedStuckFulfillment: 0, skipped: true }
    }
    throw error
  }
  return data || { cancelledPending: 0, failedStuckFulfillment: 0 }
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