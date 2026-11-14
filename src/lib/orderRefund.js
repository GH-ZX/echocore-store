import { supabase } from './supabase';

/**
 * Dashboard "refund failed order" (admin_refund_failed_order). The database runs the same
 * guards as the Telegram refund button; this mirror only decides whether to show the button.
 * Never refund by editing a balance by hand: the order would stay "not refunded" and could be
 * fulfilled (bought) again.
 */
export function canRefundFailedOrder(order) {
  if (!order || order.status !== 'completed' || order.fulfillment_status !== 'failed') return false;
  const meta = order.g2bulk_metadata || {};
  if (meta.balance_refunded === true || meta.balance_refunded === 'true') return false;
  if (meta.do_not_refulfill === true || meta.do_not_refulfill === 'true') return false;
  if (meta.free_after_refund === true || meta.free_after_refund === 'true') return false;
  if (order.payment_method !== 'balance' || !order.user_id) return false;
  if (!(Number(order.total) > 0)) return false;
  const items = Array.isArray(order.order_items) ? order.order_items : [];
  return !items.some((item) => Array.isArray(item?.delivery_items) && item.delivery_items.length > 0);
}

/** True when G2Bulk already has an order for it: the supplier may still deliver later. */
export function orderHasSupplierOrder(order) {
  const meta = order?.g2bulk_metadata || {};
  return !!(order?.g2bulk_order_id || meta.g2bulk_order_id || meta.g2bulkOrderId);
}

const REFUND_ERROR_KEYS = {
  refund_already: 'refundErrorAlready',
  refund_not_failed: 'refundErrorNotFailed',
  refund_not_balance: 'refundErrorNotBalance',
  refund_locked: 'refundErrorLocked',
  refund_delivered: 'refundErrorDelivered',
  refund_not_found: 'refundErrorNotFound',
};

/** Translation key for a refund error raised by the database (null when unknown). */
export function refundErrorKey(error) {
  const message = String(error?.message || error || '');
  const code = Object.keys(REFUND_ERROR_KEYS).find((key) => message.includes(key));
  return code ? REFUND_ERROR_KEYS[code] : null;
}

export async function adminRefundFailedOrder(orderId, reason = '') {
  const { data, error } = await supabase.rpc('admin_refund_failed_order', {
    p_order_id: orderId,
    p_reason: String(reason || '').trim() || null,
  });
  if (error) throw error;
  return data;
}
