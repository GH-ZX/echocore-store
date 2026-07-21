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

function normalizeReceiptPayload(data) {
  let payload = data
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      return null
    }
  }
  if (!payload || typeof payload !== 'object') return null
  // Some PostgREST shapes nest under `data`
  if (!payload.order && payload.data && typeof payload.data === 'object') {
    payload = payload.data
  }
  if (!payload.order) return null
  return {
    order: payload.order,
    items: Array.isArray(payload.items) ? payload.items : [],
  }
}

/**
 * Owner receipt for success page / deep links.
 * Prefer RPC; fall back to direct RLS reads if RPC is missing or empty.
 */
export async function fetchMyOrderReceipt(orderId) {
  if (!orderId) return null

  const { data, error } = await supabase.rpc('get_my_order_receipt', {
    p_order_id: orderId,
  })

  if (error) {
    const missingFn = error.message?.includes('function') && error.message?.includes('does not exist')
    if (!missingFn) {
      // Fall through to table read for transient RPC issues; rethrow if that also fails
      console.warn('get_my_order_receipt RPC error, trying table fallback:', error.message)
    } else {
      console.warn('get_my_order_receipt missing, using table fallback')
    }
  } else {
    const fromRpc = normalizeReceiptPayload(data)
    if (fromRpc) return fromRpc
  }

  // Fallback: RLS "Users own orders" + order_items policies
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) throw orderErr
  if (!order) return null

  const { data: items, error: itemsErr } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true })

  if (itemsErr) throw itemsErr

  return {
    order,
    items: Array.isArray(items) ? items : [],
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