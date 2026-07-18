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
    if (fs === 'fulfilling') return 'processing';
    if (fs === 'fulfilled' || fs === 'skipped') return 'success';

    if (fs === 'failed') {
      // Soft poll timeout WITHOUT refund → still retryable (show processing)
      if (isSoftFulfillmentTimeout(order) && !isOrderBalanceRefunded(order)) {
        return 'processing';
      }
      return 'failed';
    }

    // null / pending on completed:
    // - recent (<15m) → still may be auto-delivering
    // - older → treat as success (legacy paid orders without supplier status)
    if (fs === 'pending' || fs == null) {
      return orderAgeMs(order) < FIFTEEN_MIN_MS ? 'processing' : 'success';
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

export function getOrderStatusFilterOptions(t = {}) {
  return [
    { id: ORDER_STATUS_FILTER_IDS.ALL, label: t.adminOrdersFilterAll },
    { id: ORDER_STATUS_FILTER_IDS.SUCCESS, label: t.adminOrdersOutcomeSuccess },
    { id: ORDER_STATUS_FILTER_IDS.PROCESSING, label: t.adminOrdersOutcomeProcessing },
    { id: ORDER_STATUS_FILTER_IDS.FAILED, label: t.adminOrdersOutcomeFailed },
    { id: ORDER_STATUS_FILTER_IDS.CANCELLED, label: t.adminOrdersOutcomeCancelled },
  ];
}

/** Admin can retry G2Bulk when paid + not delivered + not refunded. */
export function canRetryOrderFulfillment(order) {
  if (!order || order.status !== 'completed') return false;
  if (isOrderBalanceRefunded(order)) return false;
  const fs = String(order.fulfillment_status || 'pending');
  return fs === 'failed' || fs === 'pending' || fs === 'fulfilling';
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
