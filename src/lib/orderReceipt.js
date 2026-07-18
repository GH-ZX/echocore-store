import { formatG2bulkGameCodeLabel, formatOrderItemDisplayName } from './offerDisplay';

export function shortOrderId(id) {
  if (!id) return '';
  return id.slice(0, 8).toUpperCase();
}

/**
 * Top-up delivery facts for receipt / admin (player target + supplier refs).
 * Merges order_items with g2bulk_metadata from the G2Bulk completion notice.
 */
export function getOrderTopupDeliveryDetails(order, items = []) {
  const meta = order?.g2bulk_metadata && typeof order.g2bulk_metadata === 'object'
    ? order.g2bulk_metadata
    : {};
  const first = Array.isArray(items) ? (items.find((row) => row?.player_uid) || items[0] || {}) : {};
  const playerUid = String(first.player_uid || meta.player_id || meta.playerId || '').trim() || null;
  const playerServer = String(first.player_server || meta.server_id || meta.serverId || '').trim() || null;
  const playerCharname = String(
    first.player_charname
    || meta.player_nickname
    || meta.player_name
    || meta.nickname
    || '',
  ).trim() || null;
  const gameCode = String(meta.g2bulk_game || meta.game_code || meta.game || '').trim() || null;
  const gameLabel = gameCode ? formatG2bulkGameCodeLabel(gameCode) : null;
  const product = String(meta.catalogue || meta.product || meta.product_title || first.name_snapshot || '').trim() || null;
  const g2bulkOrderId = String(
    order?.g2bulk_order_id
    || meta.g2bulk_order_id
    || meta.g2bulkOrderId
    || '',
  ).trim() || null;
  const supplierAmount = meta.supplier_amount_usd != null
    ? Number(meta.supplier_amount_usd)
    : meta.price != null
      ? Number(meta.price)
      : null;
  const supplierStatus = String(meta.supplier_status || meta.status || '').trim() || null;

  return {
    playerUid,
    playerServer,
    playerCharname,
    gameCode,
    gameLabel,
    product,
    g2bulkOrderId,
    supplierAmount: Number.isFinite(supplierAmount) ? supplierAmount : null,
    supplierStatus,
    hasTopupTarget: !!(playerUid || playerCharname),
  };
}

export { formatOrderItemDisplayName };

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

/**
 * Collect redeem / voucher codes from order_items.delivery_items and optional extras
 * (e.g. order.g2bulk_metadata). Handles strings, objects, nested arrays, JSON text.
 */
export function extractDeliveryCodes(orderItems = [], extras = null) {
  const codes = [];

  const push = (value) => {
    if (value == null) return;
    const text = String(value).trim();
    if (!text) return;
    // Skip obvious non-code blobs
    if (text === '[object Object]') return;
    codes.push(text);
  };

  const walk = (raw, depth = 0) => {
    if (raw == null || depth > 6) return;

    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (
        (trimmed.startsWith('[') && trimmed.endsWith(']'))
        || (trimmed.startsWith('{') && trimmed.endsWith('}'))
      ) {
        try {
          walk(JSON.parse(trimmed), depth + 1);
          return;
        } catch {
          /* plain code string */
        }
      }
      if (trimmed.includes('\n')) {
        trimmed.split(/\r?\n+/).forEach((part) => push(part));
        return;
      }
      // comma/semicolon separated multi-codes
      if (/[;,]/.test(trimmed) && trimmed.length > 12) {
        const parts = trimmed.split(/[;,]+/).map((p) => p.trim()).filter(Boolean);
        if (parts.length > 1) {
          parts.forEach((part) => push(part));
          return;
        }
      }
      push(trimmed);
      return;
    }

    if (typeof raw === 'number' || typeof raw === 'boolean') {
      push(raw);
      return;
    }

    if (Array.isArray(raw)) {
      raw.forEach((entry) => walk(entry, depth + 1));
      return;
    }

    if (typeof raw === 'object') {
      const keys = [
        'code', 'pin', 'serial', 'redeem_code', 'redeemCode', 'voucher',
        'value', 'key', 'card_number', 'cardNumber', 'card_code', 'cardCode',
        'coupon', 'token', 'license', 'activation_code', 'activationCode',
      ];
      for (const key of keys) {
        if (raw[key] != null && raw[key] !== '') push(raw[key]);
      }
      for (const nestKey of ['codes', 'delivery_items', 'deliveryItems', 'items', 'data', 'result']) {
        if (raw[nestKey] != null) walk(raw[nestKey], depth + 1);
      }
    }
  };

  for (const item of orderItems || []) {
    walk(item?.delivery_items);
    // Some historic rows may stash codes under redemption_info
    walk(item?.redemption_info);
  }

  if (extras != null) {
    walk(extras);
    if (typeof extras === 'object' && !Array.isArray(extras)) {
      walk(extras.delivery_items);
      walk(extras.deliveryItems);
      walk(extras.codes);
      walk(extras.items);
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

/** True when fulfillment failed because the store's G2Bulk wallet cannot fund the item. */
export function isInsufficientSupplierBalanceFailure(order) {
  const meta = order?.g2bulk_metadata || {};
  const reason = String(meta.failure_reason || meta.reason || '');
  const lastError = String(meta.last_error || '');
  return reason === 'insufficient_supplier_balance'
    || /insufficient_supplier_balance|insufficient\s+balance|supplier wallet is too low/i.test(lastError);
}

/** Customer-facing fulfillment failure copy (never exposes raw G2Bulk wallet internals). */
export function getFulfillmentFailureMessage(order, t = {}) {
  if (order?.g2bulk_metadata?.balance_refunded === true) {
    return t.orderFulfillmentRefundedSupport || t.orderFulfillmentFailedSupport;
  }
  if (isInsufficientSupplierBalanceFailure(order)) {
    return t.orderFulfillmentNeedsAdminRestock
      || t.fulfillmentSupplierBalanceLow
      || t.orderFulfillmentFailedSupport;
  }
  return t.orderFulfillmentFailedSupport || 'Auto-fulfillment failed. Contact support with your order ID.';
}

export function getOrderReceiptPresentation(order, t = {}) {
  const status = order?.status;
  const fs = order?.fulfillment_status == null || order?.fulfillment_status === ''
    ? null
    : String(order.fulfillment_status);

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
    if (fs === 'failed') {
      return {
        tone: 'danger',
        title: t.orderReceiptTitleFulfillmentFailed || t.fulfillmentFailed || 'Delivery failed',
        subtitle: getFulfillmentFailureMessage(order, t)
          || t.orderReceiptSubtitleFulfillmentFailed
          || t.orderFulfillmentFailedSupport,
        showSuccess: false,
      };
    }

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
  return fs === 'pending' || fs === 'fulfilling' || fs === 'failed';
}