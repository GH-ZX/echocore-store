export function shortOrderId(id) {
  if (!id) return '';
  return id.slice(0, 8).toUpperCase();
}

export function formatOrderDisplayId(orderOrId) {
  if (!orderOrId) return '';
  if (typeof orderOrId === 'object') {
    if (orderOrId.order_ref) return String(orderOrId.order_ref);
    return shortOrderId(orderOrId.id);
  }
  return shortOrderId(orderOrId);
}

export function getOrderStatusTone(status) {
  if (status === 'completed') return 'success';
  if (status === 'payment_sent') return 'warning';
  if (status === 'pending_payment') return 'pending';
  if (status === 'cancelled') return 'danger';
  return 'neutral';
}

export function getOrderStatusColorClass(status) {
  const tone = getOrderStatusTone(status);
  if (tone === 'success') return 'text-emerald-400';
  if (tone === 'warning') return 'text-amber-300';
  if (tone === 'pending') return 'text-amber-400';
  if (tone === 'danger') return 'text-red-400';
  return 'text-[var(--text-sec)]';
}

export function isOrderPaid(order) {
  return order?.status === 'completed';
}

export function isOrderIncomplete(order) {
  return order?.status === 'pending_payment' || order?.status === 'payment_sent';
}

export function isOrderCancelled(order) {
  return order?.status === 'cancelled';
}

export function extractDeliveryCodes(orderItems = []) {
  const codes = [];

  for (const item of orderItems) {
    const raw = item?.delivery_items;
    if (!raw) continue;

    const list = Array.isArray(raw) ? raw : [raw];
    for (const entry of list) {
      if (typeof entry === 'string') {
        const trimmed = entry.trim();
        if (trimmed) codes.push(trimmed);
        continue;
      }

      if (entry && typeof entry === 'object') {
        const candidate = entry.code
          || entry.pin
          || entry.serial
          || entry.redeem_code
          || entry.voucher
          || entry.value;
        if (candidate != null && String(candidate).trim()) {
          codes.push(String(candidate).trim());
        }
      }
    }
  }

  return [...new Set(codes)];
}

export function getOrderStatusLabel(status, t = {}) {
  const map = {
    pending_payment: t.orderStatusPendingPayment,
    payment_sent: t.orderStatusPaymentSent,
    completed: t.orderStatusCompleted,
    cancelled: t.orderStatusCancelled,
  };
  return map[status] || status || '—';
}

export function getOrderReceiptPresentation(order, t = {}) {
  const status = order?.status;

  if (status === 'cancelled') {
    return {
      tone: 'danger',
      title: t.orderReceiptTitleCancelled,
      subtitle: t.orderReceiptSubtitleCancelled,
      showSuccess: false,
    };
  }

  if (status === 'pending_payment') {
    return {
      tone: 'warning',
      title: t.orderReceiptTitlePendingPayment,
      subtitle: t.orderReceiptSubtitlePendingPayment,
      showSuccess: false,
    };
  }

  if (status === 'payment_sent') {
    return {
      tone: 'warning',
      title: t.orderReceiptTitlePaymentSent,
      subtitle: t.orderReceiptSubtitlePaymentSent,
      showSuccess: false,
    };
  }

  if (status === 'completed') {
    if (order?.payment_method === 'admin_gift') {
      return {
        tone: 'success',
        title: t.orderReceiptTitleGift,
        subtitle: order.gift_message || t.orderReceiptSubtitleGift,
        showSuccess: true,
      };
    }

    return {
      tone: 'success',
      title: t.orderReceiptTitleCompleted,
      subtitle: t.orderReceiptSubtitleCompleted,
      showSuccess: true,
    };
  }

  return {
    tone: 'info',
    title: t.orderReceiptTitle,
    subtitle: t.orderReceiptSubtitle,
    showSuccess: false,
  };
}

export function shouldTriggerFulfillment(order) {
  if (!order || order.status !== 'completed') return false;
  const fs = order.fulfillment_status || 'pending';
  return fs === 'pending' || fs === 'fulfilling';
}