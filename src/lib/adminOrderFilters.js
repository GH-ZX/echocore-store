import { formatMessage } from './i18n';
import { formatOrderDisplayId } from './orderReceipt';
import { getProfileAdminLabel, getProfileUsername } from './username';

export const ORDER_STATUS_FILTER_IDS = {
  ALL: 'all',
  PENDING_PAYMENT: 'pending_payment',
  PAYMENT_SENT: 'payment_sent',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
};

export function getOrderStatusFilterOptions(t = {}) {
  return [
    { id: ORDER_STATUS_FILTER_IDS.ALL, label: t.adminOrdersFilterAll },
    { id: ORDER_STATUS_FILTER_IDS.PENDING_PAYMENT, label: t.orderStatusPendingPayment },
    { id: ORDER_STATUS_FILTER_IDS.PAYMENT_SENT, label: t.orderStatusPaymentSent },
    { id: ORDER_STATUS_FILTER_IDS.COMPLETED, label: t.orderStatusCompleted },
    { id: ORDER_STATUS_FILTER_IDS.CANCELLED, label: t.orderStatusCancelled },
  ];
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
    getProfileUsername(order?.profiles),
    order?.profiles?.name,
    order?.profiles?.email,
    order?.payment_method,
    order?.status,
    ...(order?.order_items || []).map((item) => item?.name_snapshot),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(query) || formatOrderDisplayId(order).toLowerCase().includes(query);
}

export function matchesOrderStatus(order, statusFilter = ORDER_STATUS_FILTER_IDS.ALL) {
  if (!order || statusFilter === ORDER_STATUS_FILTER_IDS.ALL) return true;
  return order.status === statusFilter;
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