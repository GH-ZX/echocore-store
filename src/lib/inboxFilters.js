export const INBOX_FILTER_IDS = {
  ALL: 'all',
  UNREAD: 'unread',
  ACTIVITY: 'activity',
  ORDERS: 'orders',
  RECHARGES: 'recharges',
  INVOICES: 'invoices',
  ADMIN: 'admin',
  MESSAGES: 'messages',
};

const ORDER_TYPES = new Set([
  'order_payment_sent',
  'order_completed',
  'order_rejected',
  'purchase_completed',
  'order_gifted',
  'delivery_ready',
  'topup_delivered',
  'order_fulfilled',
  'fulfillment_failed',
  'fulfillment_failed_refunded',
  'admin_order_payment_sent',
  'admin_purchase_completed',
  'admin_delivery_ready',
  'admin_topup_delivered',
  'admin_order_fulfilled',
  'admin_fulfillment_failed',
]);

const RECHARGE_TYPES = new Set([
  'recharge_payment_sent',
  'recharge_approved',
  'recharge_rejected',
  'admin_recharge_payment_sent',
  'admin_recharge_completed',
]);

/** Inbox “Invoices” filter = only successful outcomes that open a real invoice. */
const INVOICE_TYPES = new Set([
  'order_gifted',
  'delivery_ready',
  'topup_delivered',
  'order_fulfilled',
  'recharge_approved',
  'admin_recharge_completed',
  'admin_delivery_ready',
  'admin_topup_delivered',
  'admin_order_fulfilled',
]);

const ADMIN_TYPES = new Set([
  'admin_recharge_payment_sent',
  'admin_recharge_completed',
  'admin_order_payment_sent',
  'admin_contact_message',
  'admin_purchase_completed',
  'admin_delivery_ready',
  'admin_topup_delivered',
  'admin_order_fulfilled',
  'admin_fulfillment_failed',
]);

const MESSAGE_TYPES = new Set([
  'admin_announcement',
  'admin_warning',
  'admin_maintenance_notice',
  'account_banned',
  'admin_contact_message',
]);

/** Store activity: sales, recharges, contact, fulfillment — everything admin cares about. */
export function matchesAdminActivityFilter(item) {
  return ORDER_TYPES.has(item?.type)
    || RECHARGE_TYPES.has(item?.type)
    || ADMIN_TYPES.has(item?.type)
    || MESSAGE_TYPES.has(item?.type);
}

export function getInboxFilterOptions(t = {}, userRole) {
  const options = [
    { id: INBOX_FILTER_IDS.ALL, label: t.inboxFilterAll },
    { id: INBOX_FILTER_IDS.UNREAD, label: t.inboxFilterUnread },
    { id: INBOX_FILTER_IDS.ORDERS, label: t.inboxFilterOrders },
    { id: INBOX_FILTER_IDS.RECHARGES, label: t.inboxFilterRecharges },
    { id: INBOX_FILTER_IDS.INVOICES, label: t.inboxFilterInvoices },
    { id: INBOX_FILTER_IDS.MESSAGES, label: t.inboxFilterMessages },
  ];

  if (userRole === 'admin') {
    options.push({ id: INBOX_FILTER_IDS.ADMIN, label: t.inboxFilterAdmin });
  }

  return options;
}

/** Admin dashboard inbox — default to All so nothing is hidden. */
export function getAdminInboxFilterOptions(t = {}) {
  return [
    { id: INBOX_FILTER_IDS.ALL, label: t.inboxFilterAll },
    { id: INBOX_FILTER_IDS.ACTIVITY, label: t.adminInboxFilterActivity },
    { id: INBOX_FILTER_IDS.UNREAD, label: t.inboxFilterUnread },
    { id: INBOX_FILTER_IDS.RECHARGES, label: t.inboxFilterRecharges },
    { id: INBOX_FILTER_IDS.ORDERS, label: t.inboxFilterOrders },
    { id: INBOX_FILTER_IDS.INVOICES, label: t.inboxFilterInvoices },
    { id: INBOX_FILTER_IDS.MESSAGES, label: t.inboxFilterMessages },
  ];
}

export function matchesInboxFilter(item, filterId = INBOX_FILTER_IDS.ALL) {
  if (!item) return false;

  switch (filterId) {
    case INBOX_FILTER_IDS.UNREAD:
      return !item.read_at;
    case INBOX_FILTER_IDS.ACTIVITY:
      return matchesAdminActivityFilter(item);
    case INBOX_FILTER_IDS.ORDERS:
      return ORDER_TYPES.has(item.type);
    case INBOX_FILTER_IDS.RECHARGES:
      return RECHARGE_TYPES.has(item.type);
    case INBOX_FILTER_IDS.INVOICES:
      return INVOICE_TYPES.has(item.type);
    case INBOX_FILTER_IDS.ADMIN:
      return ADMIN_TYPES.has(item.type);
    case INBOX_FILTER_IDS.MESSAGES:
      return MESSAGE_TYPES.has(item.type);
    default:
      return true;
  }
}

export function filterInboxNotifications(notifications = [], filterId = INBOX_FILTER_IDS.ALL) {
  if (filterId === INBOX_FILTER_IDS.ALL) return notifications;
  return notifications.filter((item) => matchesInboxFilter(item, filterId));
}

export function countInboxFilterMatches(notifications = [], filterId = INBOX_FILTER_IDS.ALL) {
  return filterInboxNotifications(notifications, filterId).length;
}

export function getInboxEmptyMessageKey(filterId = INBOX_FILTER_IDS.ALL) {
  switch (filterId) {
    case INBOX_FILTER_IDS.UNREAD:
      return 'inboxEmptyUnread';
    case INBOX_FILTER_IDS.ACTIVITY:
      return 'adminInboxEmptyActivity';
    case INBOX_FILTER_IDS.ORDERS:
      return 'inboxEmptyOrders';
    case INBOX_FILTER_IDS.RECHARGES:
      return 'inboxEmptyRecharges';
    case INBOX_FILTER_IDS.INVOICES:
      return 'inboxEmptyInvoices';
    case INBOX_FILTER_IDS.ADMIN:
      return 'inboxEmptyAdmin';
    case INBOX_FILTER_IDS.MESSAGES:
      return 'inboxEmptyMessages';
    default:
      return 'noNotifications';
  }
}
