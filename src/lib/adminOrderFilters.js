import { formatMessage } from './i18n';
import { formatOrderDisplayId } from './orderReceipt';
import { getProfileAdminLabel, getProfileUsername } from './username';

/** Admin list outcomes — not raw payment status. */
export const ORDER_STATUS_FILTER_IDS = {
  ALL: 'all',
  SUCCESS: 'success',
  FAILED: 'failed',
  PROCESSING: 'processing',
  CANCELLED: 'cancelled',
};

const FIFTEEN_MIN_MS = 15 * 60 * 1000;

const SOFT_TIMEOUT_RE = /timed?\s*out|polling timed|still processing|signal has been aborted|abort|deadline|network/i;

function orderAgeMs(order) {
  const ts = order?.created_at || order?.updated_at;
  if (!ts) return Number.POSITIVE_INFINITY;
  const ms = new Date(ts).getTime();
  return Number.isFinite(ms) ? Date.now() - ms : Number.POSITIVE_INFINITY;
}

/** Soft G2Bulk poll/abort failures — not a real supplier reject. */
export function isSoftFulfillmentTimeout(order) {
  const err = String(order?.g2bulk_metadata?.last_error || '');
  if (!err) return false;
  return SOFT_TIMEOUT_RE.test(err);
}

export function isOrderBalanceRefunded(order) {
  return order?.g2bulk_metadata?.balance_refunded === true
    || order?.g2bulk_metadata?.balance_refunded === 'true';
}

/**
 * Map an order to a simple admin outcome for display/filtering.
 * - success: paid + delivered (or paid legacy without active failure)
 * - failed: real fulfillment failure / refunded failure
 * - cancelled: unpaid checkout abandoned/cancelled
 * - processing: unpaid in flight, fulfilling, or retryable soft timeout
 */
export function getAdminOrderOutcome(order) {
  if (!order) return 'processing';

  const status = String(order.status || '');
  const fs = order.fulfillment_status == null || order.fulfillment_status === ''
    ? null
    : String(order.fulfillment_status);

  if (status === 'cancelled') return 'cancelled';

  if (status === 'pending_payment' || status === 'payment_sent') {
    return 'processing';
  }

  if (status === 'completed') {
    if (fs === 'fulfilled' || fs === 'skipped') return 'success';

    const recent = orderAgeMs(order) < FIFTEEN_MIN_MS;

    // Only RECENT in-flight work is "processing". Old stuck rows must not flood the queue.
    if (fs === 'fulfilling') {
      return recent ? 'processing' : 'failed';
    }

    if (fs === 'failed') {
      // Soft timeout without refund: processing only while still fresh
      if (recent && isSoftFulfillmentTimeout(order) && !isOrderBalanceRefunded(order)) {
        return 'processing';
      }
      return 'failed';
    }

    // null / pending on completed
    if (fs === 'pending' || fs == null) {
      if (recent) return 'processing';
      // Old restored soft-timeouts / abandoned pending → failed (not endless processing)
      if (
        isSoftFulfillmentTimeout(order)
        || order?.g2bulk_metadata?.restored_from_soft_timeout
        || order?.g2bulk_metadata?.restored_for_code_recovery
        || order?.g2bulk_metadata?.stale_closed
      ) {
        return 'failed';
      }
      // Legacy paid orders with no supplier trail → treat as success
      return 'success';
    }

    return 'success';
  }

  // status === 'failed' (payment failed) etc.
  if (status === 'failed') return 'failed';

  return 'processing';
}

export function getAdminOrderOutcomeLabel(outcome, t = {}) {
  if (outcome === 'success') return t.adminOrdersOutcomeSuccess || t.orderStatusCompleted || 'Success';
  if (outcome === 'failed') return t.adminOrdersOutcomeFailed || t.orderStatusCancelled || 'Failed';
  if (outcome === 'cancelled') return t.adminOrdersOutcomeCancelled || t.orderStatusCancelled || 'Cancelled';
  return t.adminOrdersOutcomeProcessing || t.orderStatusPendingPayment || 'Processing';
}

export function getAdminOrderOutcomeTone(outcome) {
  if (outcome === 'success') return 'success';
  if (outcome === 'failed') return 'danger';
  if (outcome === 'cancelled') return 'neutral';
  return 'pending';
}

/**
 * Payment lifecycle label (paid vs awaiting) — separate from delivery.
 * order.status "completed" means customer paid, not that top-up arrived.
 */
export function getAdminPaymentStatusLabel(order, t = {}) {
  const status = String(order?.status || '');
  if (status === 'completed') {
    return t.adminOrderPaid || t.orderStatusCompleted || 'Paid';
  }
  if (status === 'pending_payment') {
    return t.orderStatusPendingPayment || 'Awaiting payment';
  }
  if (status === 'payment_sent') {
    return t.orderStatusPaymentSent || 'Awaiting approval';
  }
  if (status === 'cancelled') {
    return t.adminOrdersOutcomeCancelled || t.orderStatusCancelled || 'Cancelled';
  }
  if (status === 'failed') {
    return t.adminOrdersOutcomeFailed || 'Failed';
  }
  return status || '—';
}

export function getAdminPaymentStatusTone(order) {
  const status = String(order?.status || '');
  if (status === 'completed') return 'success';
  if (status === 'cancelled' || status === 'failed') return 'danger';
  if (status === 'pending_payment' || status === 'payment_sent') return 'pending';
  return 'neutral';
}

/**
 * Delivery/fulfillment label for admin UI.
 * When outcome is failed but raw fs is still "fulfilling", show "stuck" — not "delivering".
 */
export function getAdminDeliveryStatusDisplay(order, t = {}) {
  const outcome = getAdminOrderOutcome(order);
  const fs = order?.fulfillment_status == null || order?.fulfillment_status === ''
    ? null
    : String(order.fulfillment_status);
  const refunded = isOrderBalanceRefunded(order);

  if (outcome === 'cancelled') {
    return {
      label: t.adminOrdersOutcomeCancelled || t.orderStatusCancelled || 'Cancelled',
      tone: 'neutral',
      hint: null,
    };
  }

  if (fs === 'fulfilled') {
    return {
      label: t.fulfillmentDone || 'Delivered',
      tone: 'success',
      hint: null,
    };
  }
  if (fs === 'skipped') {
    return {
      label: t.fulfillmentSkipped || 'Skipped',
      tone: 'neutral',
      hint: null,
    };
  }

  if (outcome === 'success') {
    // Legacy paid rows without supplier trail
    return {
      label: t.fulfillmentDone || t.adminOrdersOutcomeSuccess || 'Delivered',
      tone: 'success',
      hint: null,
    };
  }

  if (outcome === 'failed') {
    if (refunded) {
      return {
        label: t.fulfillmentFailed || 'Delivery failed',
        tone: 'danger',
        hint: t.adminOrdersRefundedHint || null,
      };
    }
    // Stuck fulfilling / abandoned pending — not actively delivering
    if (fs === 'fulfilling' || fs === 'pending' || fs == null) {
      return {
        label: t.fulfillmentStuck || t.fulfillmentFailed || 'Delivery stuck',
        tone: 'danger',
        hint: t.fulfillmentStuckHint || t.adminOrdersSoftTimeoutHint || null,
      };
    }
    return {
      label: t.fulfillmentFailed || 'Delivery failed',
      tone: 'danger',
      hint: isSoftFulfillmentTimeout(order)
        ? (t.adminOrdersSoftTimeoutHint || null)
        : null,
    };
  }

  // processing
  if (fs === 'fulfilling') {
    return {
      label: t.fulfillmentInProgress || 'Delivering',
      tone: 'pending',
      hint: null,
    };
  }
  if (fs === 'failed' && isSoftFulfillmentTimeout(order) && !refunded) {
    return {
      label: t.fulfillmentInProgress || 'Delivering',
      tone: 'warning',
      hint: t.adminOrdersSoftTimeoutHint || null,
    };
  }
  if (fs === 'pending' || fs == null) {
    return {
      label: t.fulfillmentPending || 'Awaiting delivery',
      tone: 'pending',
      hint: null,
    };
  }
  if (fs === 'failed') {
    return {
      label: t.fulfillmentFailed || 'Delivery failed',
      tone: 'danger',
      hint: null,
    };
  }
  return {
    label: fs,
    tone: 'neutral',
    hint: null,
  };
}

export function getOrderStatusFilterOptions(t = {}) {
  return [
    { id: ORDER_STATUS_FILTER_IDS.ALL, label: t.adminOrdersFilterAll },
    { id: ORDER_STATUS_FILTER_IDS.SUCCESS, label: t.adminOrdersOutcomeSuccess },
    { id: ORDER_STATUS_FILTER_IDS.PROCESSING, label: t.adminOrdersOutcomeProcessing },
    { id: ORDER_STATUS_FILTER_IDS.FAILED, label: t.adminOrdersOutcomeFailed },
    { id: ORDER_STATUS_FILTER_IDS.CANCELLED, label: t.adminOrdersOutcomeCancelled },
  ];
}

/** Admin can retry G2Bulk when paid + not delivered + not refunded. Never on success. */
export function canRetryOrderFulfillment(order) {
  if (!order || order.status !== 'completed') return false;
  if (isOrderBalanceRefunded(order)) return false;
  const meta = order?.g2bulk_metadata || {};
  // Verified free-after-refund / audit lock — never re-ship
  if (
    meta.do_not_refulfill === true
    || meta.free_after_refund === true
    || meta.verified_from_g2bulk === true && meta.balance_refunded
  ) {
    return false;
  }
  const fs = order.fulfillment_status == null || order.fulfillment_status === ''
    ? 'pending'
    : String(order.fulfillment_status);
  // Already delivered / intentionally skipped — no re-fulfill button
  if (fs === 'fulfilled' || fs === 'skipped') return false;
  // Outcome already success (legacy paid row) — do not re-ship
  if (getAdminOrderOutcome(order) === 'success') return false;

  // Supplier id known → poll-only resume (never a second purchase). Always allow,
  // even for old stuck "fulfilling" top-ups that completed in the G2Bulk bot.
  if (order.g2bulk_order_id) return true;

  // No supplier id yet: only recent in-flight or hard-failed may start a NEW purchase
  if (fs === 'fulfilling' || fs === 'pending') {
    return orderAgeMs(order) < FIFTEEN_MIN_MS;
  }
  return fs === 'failed';
}

/** Show red/amber error banner only when the order is not a success. */
export function shouldShowAdminFulfillmentError(order) {
  if (!order?.g2bulk_metadata?.last_error) return false;
  const outcome = getAdminOrderOutcome(order);
  if (outcome === 'success' || outcome === 'cancelled') return false;
  const fs = String(order.fulfillment_status || '');
  if (fs === 'fulfilled' || fs === 'skipped') return false;
  return outcome === 'failed' || outcome === 'processing';
}

function normalizeSearch(value = '') {
  return String(value).trim().toLowerCase();
}

export function matchesOrderSearch(order, search = '') {
  const query = normalizeSearch(search);
  if (!query) return true;

  const haystack = [
    order?.order_ref,
    order?.id,
    order?.payment_reference,
    order?.g2bulk_order_id,
    order?.g2bulk_metadata?.player_id,
    order?.g2bulk_metadata?.player_nickname,
    order?.g2bulk_metadata?.g2bulk_game,
    order?.g2bulk_metadata?.catalogue,
    getProfileUsername(order?.profiles),
    order?.profiles?.name,
    order?.profiles?.email,
    order?.payment_method,
    order?.status,
    order?.fulfillment_status,
    ...(order?.order_items || []).flatMap((item) => [
      item?.name_snapshot,
      item?.player_uid,
      item?.player_charname,
    ]),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query) || formatOrderDisplayId(order).toLowerCase().includes(query);
}

export function matchesOrderStatus(order, statusFilter = ORDER_STATUS_FILTER_IDS.ALL) {
  if (!order || statusFilter === ORDER_STATUS_FILTER_IDS.ALL) return true;
  return getAdminOrderOutcome(order) === statusFilter;
}

export function matchesOrderUser(order, userId = '') {
  if (!userId) return true;
  return order?.user_id === userId;
}

export function filterAdminOrders(
  orders = [],
  {
    search = '',
    statusFilter = ORDER_STATUS_FILTER_IDS.ALL,
    userId = '',
  } = {},
) {
  return orders.filter((order) => (
    matchesOrderUser(order, userId)
    && matchesOrderStatus(order, statusFilter)
    && matchesOrderSearch(order, search)
  ));
}

export function countOrdersForFilter(orders = [], filterId) {
  return orders.filter((order) => matchesOrderStatus(order, filterId)).length;
}

export function getAdminOrdersEmptyMessageKey({
  search = '',
  statusFilter = ORDER_STATUS_FILTER_IDS.ALL,
  userId = '',
} = {}) {
  if (userId) return 'adminOrdersEmptyUser';
  if (search.trim()) return 'adminOrdersEmptySearch';
  if (statusFilter !== ORDER_STATUS_FILTER_IDS.ALL) {
    return 'adminOrdersEmptyFiltered';
  }
  return 'noOrdersYet';
}

export function getOrderCustomerLabel(order, t = {}) {
  if (order?.profiles) {
    return getProfileAdminLabel(order.profiles, t.adminOrdersUnknownCustomer);
  }
  if (order?.user_id) {
    return formatMessage(t.adminOrdersCustomerFallback, { id: order.user_id.slice(0, 8) });
  }
  return t.adminOrdersUnknownCustomer;
}
