import { supabase } from './supabase';
import { getAdminContactPath, getAdminDashboardPath } from './adminRoutes';
import { getInvoiceRouteFromNotification } from './invoiceBuilder';

const RPC_SETUP_MSG =
  'Notifications are not configured. Run supabase_echocore_full.sql in the Supabase SQL Editor.';

function isMissingRpc(error) {
  return error?.message?.includes('function') && error?.message?.includes('does not exist');
}

function formatMoney(value) {
  const num = parseFloat(value);
  return Number.isFinite(num) ? `$${num.toFixed(2)}` : '';
}

function applyTemplate(template, vars = {}) {
  if (!template) return '';
  return Object.entries(vars).reduce(
    (text, [key, value]) => text.replaceAll(`{${key}}`, String(value ?? '')),
    template,
  );
}

export function formatNotification(item, t = {}, lang = 'ar') {
  const m = item?.metadata || {};
  const amount = formatMoney(m.amount ?? m.total);
  const userName = m.userName || (lang === 'ar' ? 'عميل' : 'Customer');
  const reference = m.reference || '';
  const newBalance = formatMoney(m.newBalance);

  const currentBalance = formatMoney(m.currentBalance);

  const templates = {
    recharge_payment_sent: {
      title: t.notifRechargeQueuedTitle,
      body: applyTemplate(t.notifRechargeQueuedBody, { amount, balance: currentBalance, reference }),
      tone: 'info',
    },
    order_payment_sent: {
      title: t.notifOrderQueuedTitle,
      body: applyTemplate(t.notifOrderQueuedBody, { amount, balance: currentBalance, reference }),
      tone: 'info',
    },
    admin_recharge_payment_sent: {
      title: t.notifAdminRechargeTitle,
      body: applyTemplate(t.notifAdminRechargeBody, { amount, user: userName, reference }),
      adminTab: 'recharges',
      tone: 'warning',
    },
    admin_recharge_completed: {
      title: t.notifAdminRechargeCompletedTitle,
      body: applyTemplate(t.notifAdminRechargeCompletedBody, { amount, user: userName }),
      adminTab: 'recharges',
      tone: 'success',
    },
    admin_order_payment_sent: {
      title: t.notifAdminOrderTitle,
      body: applyTemplate(t.notifAdminOrderBody, { amount, user: userName, reference }),
      adminTab: 'orders',
      tone: 'warning',
    },
    admin_purchase_completed: {
      title: t.notifAdminPurchaseTitle || t.notifAdminOrderTitle,
      body: applyTemplate(
        t.notifAdminPurchaseBody || t.notifAdminOrderBody,
        { amount, user: userName, reference: m.paymentMethod || reference },
      ),
      adminTab: 'orders',
      tone: 'success',
    },
    admin_delivery_ready: {
      title: t.notifAdminDeliveryTitle || t.notifDeliveryReadyTitle,
      body: applyTemplate(
        t.notifAdminDeliveryBody || t.notifDeliveryReadyBody,
        { amount, user: userName },
      ),
      adminTab: 'orders',
      tone: 'success',
    },
    admin_topup_delivered: {
      title: t.notifAdminTopupTitle || t.notifTopupDeliveredTitle,
      body: applyTemplate(
        t.notifAdminTopupBody || t.notifTopupDeliveredBody,
        { amount, user: userName },
      ),
      adminTab: 'orders',
      tone: 'success',
    },
    admin_order_fulfilled: {
      title: t.notifAdminFulfilledTitle || t.notifOrderFulfilledTitle,
      body: applyTemplate(
        t.notifAdminFulfilledBody || t.notifOrderFulfilledBody,
        { amount, user: userName },
      ),
      adminTab: 'orders',
      tone: 'success',
    },
    admin_fulfillment_failed: {
      title: t.notifAdminFulfillFailedTitle || t.notifFulfillmentFailedTitle,
      body: applyTemplate(
        t.notifAdminFulfillFailedBody || t.notifFulfillmentFailedBody,
        { amount, user: userName },
      ),
      adminTab: 'orders',
      tone: 'danger',
    },
    admin_contact_message: {
      title: t.notifAdminContactTitle,
      body: m.message
        ? applyTemplate(t.notifAdminContactBodyWithMessage || t.notifAdminContactBody, {
          name: m.name || userName,
          email: m.email || '',
          message: String(m.message).slice(0, 160),
        })
        : applyTemplate(t.notifAdminContactBody, { name: m.name || userName, email: m.email || '' }),
      adminTab: 'contact',
      tone: 'info',
    },
    recharge_approved: {
      title: t.notifRechargeApprovedTitle,
      body: applyTemplate(t.notifRechargeApprovedBody, { amount, balance: newBalance }),
      tone: 'success',
    },
    recharge_rejected: {
      title: t.notifRechargeRejectedTitle,
      body: applyTemplate(t.notifRechargeRejectedBody, { amount }),
      tone: 'danger',
    },
    order_completed: {
      title: t.notifOrderCompletedTitle,
      body: applyTemplate(t.notifOrderCompletedBody, { amount }),
      tone: 'success',
    },
    order_rejected: {
      title: t.notifOrderRejectedTitle,
      body: applyTemplate(t.notifOrderRejectedBody, { amount }),
      tone: 'danger',
    },
    purchase_completed: {
      title: t.notifPurchaseCompletedTitle,
      body: applyTemplate(t.notifPurchaseCompletedBody, { amount, balance: newBalance }),
      tone: 'success',
    },
    order_gifted: {
      title: t.notifOrderGiftedTitle,
      body: m.giftMessage
        ? applyTemplate(t.notifOrderGiftedBody, { giftMessage: m.giftMessage })
        : applyTemplate(t.notifOrderGiftedBodyFallback, { offer: m.offerName || amount }),
      tone: 'success',
    },
    delivery_ready: {
      title: t.notifDeliveryReadyTitle,
      body: Array.isArray(m.codes) && m.codes.length > 0
        ? applyTemplate(t.notifDeliveryReadyBodyWithCodes, {
          amount,
          codes: m.codes.map((code) => String(code)).join(', '),
        })
        : applyTemplate(t.notifDeliveryReadyBody, { amount }),
      tone: 'success',
    },
    topup_delivered: {
      title: t.notifTopupDeliveredTitle,
      body: applyTemplate(t.notifTopupDeliveredBody, { amount }),
      tone: 'success',
    },
    order_fulfilled: {
      title: t.notifOrderFulfilledTitle,
      body: applyTemplate(t.notifOrderFulfilledBody, { amount }),
      tone: 'success',
    },
    fulfillment_failed: {
      title: t.notifFulfillmentFailedTitle,
      body: applyTemplate(t.notifFulfillmentFailedBody, { amount }),
      tone: 'danger',
    },
    fulfillment_failed_refunded: {
      title: t.notifFulfillmentRefundedTitle,
      body: applyTemplate(t.notifFulfillmentRefundedBody, {
        amount,
        newBalance: formatMoney(m.newBalance),
      }),
      tone: 'warning',
    },
    admin_announcement: {
      title: m.title || t.notifAdminAnnouncementTitle,
      body: m.body || '',
      tone: 'info',
    },
    admin_warning: {
      title: m.title || t.notifAdminWarningTitle,
      body: m.body || '',
      tone: 'warning',
    },
    admin_maintenance_notice: {
      title: m.title || t.notifAdminMaintenanceTitle,
      body: m.body || '',
      tone: 'warning',
    },
    account_banned: {
      title: t.notifAccountBannedTitle,
      body: applyTemplate(t.notifAccountBannedBody, { reason: m.reason || '' }),
      tone: 'danger',
    },
  };

  const fallback = {
    title: t.inboxNotificationFallbackTitle,
    body: item?.type || t.inboxNotificationFallbackBody || '',
    tone: 'info',
  };

  return { ...fallback, ...(templates[item?.type] || {}) };
}

const ADMIN_RECHARGE_TYPES = new Set([
  'admin_recharge_payment_sent',
  'admin_recharge_completed',
  'recharge_payment_sent',
  'recharge_approved',
  'recharge_rejected',
]);

const ADMIN_ORDER_TYPES = new Set([
  'admin_order_payment_sent',
  'admin_purchase_completed',
  'admin_delivery_ready',
  'admin_topup_delivered',
  'admin_order_fulfilled',
  'admin_fulfillment_failed',
  'order_payment_sent',
  'order_completed',
  'purchase_completed',
  'order_gifted',
  'delivery_ready',
  'topup_delivered',
  'order_fulfilled',
  'fulfillment_failed',
  'fulfillment_failed_refunded',
]);

export function getNotificationDestination(item, formatted, userRole) {
  const metadata = item?.metadata || {};
  const orderId = metadata.orderId;
  const requestId = metadata.requestId;
  const invoicePath = getInvoiceRouteFromNotification(item);

  if (userRole === 'admin') {
    // Invoice only for successful delivery / approved recharge notification types
    if (invoicePath) {
      return { path: invoicePath };
    }
    if (item?.type === 'admin_contact_message') {
      const messageId = metadata.messageId || metadata.message_id || '';
      const dest = getAdminContactPath({ messageId });
      if (typeof dest === 'string') return { path: dest };
      return { path: dest.pathname, state: dest.state };
    }
    if (ADMIN_RECHARGE_TYPES.has(item?.type)) {
      // Only completed recharges open invoice; pending go to recharges tab
      if (
        requestId
        && (item?.type === 'admin_recharge_completed' || item?.type === 'recharge_approved')
      ) {
        return { path: `/invoice/recharge/${requestId}` };
      }
      return {
        path: getAdminDashboardPath('recharges'),
        state: requestId ? { highlightRechargeId: requestId } : undefined,
      };
    }
    if (ADMIN_ORDER_TYPES.has(item?.type) && orderId) {
      // Failures / bare purchase → orders list, not a fake invoice
      if (
        item?.type === 'admin_fulfillment_failed'
        || item?.type === 'fulfillment_failed'
        || item?.type === 'fulfillment_failed_refunded'
        || item?.type === 'admin_purchase_completed'
        || item?.type === 'purchase_completed'
        || item?.type === 'admin_order_payment_sent'
        || item?.type === 'order_payment_sent'
      ) {
        return { path: getAdminDashboardPath('orders'), state: { highlightOrderId: orderId } };
      }
      return { path: getAdminDashboardPath('orders'), state: { highlightOrderId: orderId } };
    }
    if (formatted.adminTab) {
      return { path: getAdminDashboardPath(formatted.adminTab) };
    }
    return { path: getAdminDashboardPath('inbox') };
  }

  // Customers: invoice only when notification type is a success delivery
  if (invoicePath) {
    return { path: invoicePath };
  }
  if (item?.type === 'recharge_payment_sent' || item?.type === 'recharge_rejected') {
    return { path: '/recharge' };
  }
  if (item?.type === 'recharge_approved' && requestId) {
    return { path: `/invoice/recharge/${requestId}` };
  }
  if (orderId && (
    item?.type === 'delivery_ready'
    || item?.type === 'topup_delivered'
    || item?.type === 'order_fulfilled'
    || item?.type === 'order_gifted'
  )) {
    return { path: `/invoice/order/${orderId}` };
  }
  if (orderId && (
    item?.type === 'fulfillment_failed'
    || item?.type === 'fulfillment_failed_refunded'
    || item?.type === 'purchase_completed'
  )) {
    return { path: `/success?orderId=${orderId}` };
  }
  if (item?.type === 'order_payment_sent' || item?.type === 'order_rejected') {
    return { path: '/profile' };
  }
  if (item?.type === 'account_banned') {
    return { path: '/banned' };
  }
  if (item?.type === 'admin_announcement' || item?.type === 'admin_warning' || item?.type === 'admin_maintenance_notice') {
    return { path: item?.link || '/notifications' };
  }
  if (item?.link) {
    return { path: item.link };
  }
  return { path: '/profile' };
}

export const INBOX_FETCH_LIMIT = 500;

export async function fetchNotifications(limit = 30) {
  const { data, error } = await supabase.rpc('get_my_notifications', { p_limit: limit });
  if (error) {
    if (isMissingRpc(error)) throw new Error(RPC_SETUP_MSG);
    throw error;
  }
  return Array.isArray(data) ? data : [];
}

export async function fetchUnreadCount() {
  const { data, error } = await supabase.rpc('get_unread_notification_count');
  if (error) {
    if (isMissingRpc(error)) return 0;
    throw error;
  }
  return typeof data === 'number' ? data : 0;
}

export async function markNotificationRead(notificationId) {
  const { data, error } = await supabase.rpc('mark_notification_read', {
    p_notification_id: notificationId,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(RPC_SETUP_MSG);
    throw error;
  }
  return data;
}

export async function markAllNotificationsRead() {
  const { data, error } = await supabase.rpc('mark_all_notifications_read');
  if (error) {
    if (isMissingRpc(error)) throw new Error(RPC_SETUP_MSG);
    throw error;
  }
  return typeof data === 'number' ? data : 0;
}

/** Hides every notification from the header bell; inbox history is kept. */
export async function clearAllNotifications() {
  const { data, error } = await supabase.rpc('clear_all_notifications');
  if (error) {
    if (isMissingRpc(error)) throw new Error(RPC_SETUP_MSG);
    throw error;
  }
  return typeof data === 'number' ? data : 0;
}

/** Hides one notification from the header bell; inbox history is kept. */
export async function dismissNotification(notificationId) {
  const { data, error } = await supabase.rpc('dismiss_notification', {
    p_notification_id: notificationId,
  });
  if (error) {
    if (isMissingRpc(error)) throw new Error(RPC_SETUP_MSG);
    throw error;
  }
  return data === true;
}

export function subscribeToNotifications(userId, onInsert) {
  if (!userId) return () => {};

  const channel = supabase
    .channel(`notifications:${userId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
      },
      (payload) => {
        onInsert?.(payload.new);
      },
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}