import { supabase } from './supabase';

const RPC_SETUP_MSG =
  'Notifications are not configured. Run supabase_notifications_migration.sql in the Supabase SQL Editor.';

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

  const templates = {
    admin_recharge_payment_sent: {
      title: t.notifAdminRechargeTitle,
      body: applyTemplate(t.notifAdminRechargeBody, { amount, user: userName, reference }),
      adminTab: 'recharges',
      tone: 'warning',
    },
    admin_order_payment_sent: {
      title: t.notifAdminOrderTitle,
      body: applyTemplate(t.notifAdminOrderBody, { amount, user: userName, reference }),
      adminTab: 'orders',
      tone: 'warning',
    },
    admin_contact_message: {
      title: t.notifAdminContactTitle,
      body: applyTemplate(t.notifAdminContactBody, { name: m.name || userName, email: m.email || '' }),
      adminTab: 'overview',
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
  };

  const fallback = {
    title: lang === 'ar' ? 'إشعار' : 'Notification',
    body: item?.type || '',
    tone: 'info',
  };

  return { ...fallback, ...(templates[item?.type] || {}) };
}

export function getNotificationDestination(item, formatted, userRole) {
  if (userRole === 'admin' && formatted.adminTab) {
    return { path: '/dashboard', state: { adminTab: formatted.adminTab } };
  }
  if (item?.link) {
    return { path: item.link };
  }
  return { path: '/profile' };
}

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