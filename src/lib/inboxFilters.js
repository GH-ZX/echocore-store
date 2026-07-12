export const INBOX_FILTER_IDS = {
  ALL: 'all',
  UNREAD: 'unread',
  ORDERS: 'orders',
  RECHARGES: 'recharges',
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
  'admin_order_payment_sent',
]);

const RECHARGE_TYPES = new Set([
  'recharge_payment_sent',
  'recharge_approved',
  'recharge_rejected',
  'admin_recharge_payment_sent',
]);

const ADMIN_TYPES = new Set([
  'admin_recharge_payment_sent',
  'admin_order_payment_sent',
  'admin_contact_message',
]);

const MESSAGE_TYPES = new Set([
  'admin_announcement',
  'admin_warning',
  'admin_maintenance_notice',
  'account_banned',
]);

export function getInboxFilterOptions(t = {}, userRole) {
  const options = [
    { id: INBOX_FILTER_IDS.ALL, label: t.inboxFilterAll },
    { id: INBOX_FILTER_IDS.UNREAD, label: t.inboxFilterUnread },
    { id: INBOX_FILTER_IDS.ORDERS, label: t.inboxFilterOrders },
    { id: INBOX_FILTER_IDS.RECHARGES, label: t.inboxFilterRecharges },
    { id: INBOX_FILTER_IDS.MESSAGES, label: t.inboxFilterMessages },
  ];

  if (userRole === 'admin') {
    options.push({ id: INBOX_FILTER_IDS.ADMIN, label: t.inboxFilterAdmin });
  }

  return options;
}

export function matchesInboxFilter(item, filterId = INBOX_FILTER_IDS.ALL) {
  if (!item) return false;

  switch (filterId) {
    case INBOX_FILTER_IDS.UNREAD:
      return !item.read_at;
    case INBOX_FILTER_IDS.ORDERS:
      return ORDER_TYPES.has(item.type);
    case INBOX_FILTER_IDS.RECHARGES:
      return RECHARGE_TYPES.has(item.type);
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
    case INBOX_FILTER_IDS.ORDERS:
      return 'inboxEmptyOrders';
    case INBOX_FILTER_IDS.RECHARGES:
      return 'inboxEmptyRecharges';
    case INBOX_FILTER_IDS.ADMIN:
      return 'inboxEmptyAdmin';
    case INBOX_FILTER_IDS.MESSAGES:
      return 'inboxEmptyMessages';
    default:
      return 'noNotifications';
  }
}