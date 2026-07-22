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

/**
 * Owner receipt for success page / deep links.
 * Same path as InvoiceView: direct RLS table reads (fast, reliable).
 * RPC is optional and only used if table read returns nothing (legacy).
 */
export async function fetchMyOrderReceipt(orderId) {
  if (!orderId) return null

  // Primary path — matches InvoiceView (does not hang on missing/slow RPC)
  const { data: order, error: orderErr } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle()

  if (orderErr) throw orderErr

  if (order) {
    // order_items has no created_at column — do not .order() on it
    const { data: items, error: itemsErr } = await supabase
      .from('order_items')
      .select('*')
      .eq('order_id', orderId)

    if (itemsErr) throw itemsErr

    return {
      order,
      items: Array.isArray(items) ? items : [],
    }
  }

  // Optional legacy RPC (only if table miss — e.g. older policies)
  try {
    const { data, error } = await supabase.rpc('get_my_order_receipt', {
      p_order_id: orderId,
    })
    if (error || !data) return null

    let payload = data
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload)
      } catch {
        return null
      }
    }
    if (!payload?.order) return null
    return {
      order: payload.order,
      items: Array.isArray(payload.items) ? payload.items : [],
    }
  } catch {
    return null
  }
}

/**
 * Server-side atomic checkout.
 * - auth.uid must match userId
 * - advisory lock per user (no double spend)
 * - prices verified against offers table
 * - optional p_idempotency_key when migration applied (safe retries)
 */
export async function createOrderAtomic({
  userId,
  total,
  paymentMethod,
  items,
  playerUid = null,
  playerServer = null,
  idempotencyKey = null,
  influencerCode = null,
  t = {},
}) {
  const basePayload = {
    p_user_id: userId,
    p_total: total,
    p_payment_method: paymentMethod,
    p_items: items,
    p_player_uid: playerUid || null,
    p_player_server: playerServer || null,
  }

  const code = String(influencerCode || '').trim() || null

  // Prefer full signature (idempotency + influencer code)
  if (idempotencyKey || code) {
    const withExtras = await supabase.rpc('create_order_atomic', {
      ...basePayload,
      p_idempotency_key: idempotencyKey || null,
      p_influencer_code: code,
    })
    if (!withExtras.error) {
      return assertRpcData(withExtras.data, withExtras.error, t)
    }
    const msg = withExtras.error?.message || ''
    // Fall back without influencer code arg
    if (!/could not find the function|p_influencer_code|function.*does not exist/i.test(msg)) {
      return assertRpcData(withExtras.data, withExtras.error, t)
    }
  }

  if (idempotencyKey) {
    const withKey = await supabase.rpc('create_order_atomic', {
      ...basePayload,
      p_idempotency_key: idempotencyKey,
    })
    if (!withKey.error) {
      return assertRpcData(withKey.data, withKey.error, t)
    }
    const msg = withKey.error?.message || ''
    if (!/could not find the function|p_idempotency_key|function.*does not exist/i.test(msg)) {
      return assertRpcData(withKey.data, withKey.error, t)
    }
  }

  const { data, error } = await supabase.rpc('create_order_atomic', basePayload)
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
