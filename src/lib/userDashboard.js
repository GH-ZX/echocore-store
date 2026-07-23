import { supabase } from './supabase';
import { isOrderIncomplete } from './orderReceipt';

export const DASH_TABS = [
  'overview',
  'orders',
  'wallet',
  'uids',
  'security',
  'support',
];

export function normalizeDashTab(raw) {
  const t = String(raw || '').trim().toLowerCase();
  return DASH_TABS.includes(t) ? t : 'overview';
}

export const ORDER_STATUS_FILTERS = [
  'all',
  'completed',
  'pending_payment',
  'payment_sent',
  'cancelled',
];

export function filterUserOrders(orders = [], { status = 'all', query = '' } = {}) {
  let list = Array.isArray(orders) ? [...orders] : [];
  const st = String(status || 'all').toLowerCase();
  if (st !== 'all') {
    list = list.filter((o) => String(o?.status || '').toLowerCase() === st);
  }
  const q = String(query || '').trim().toLowerCase();
  if (q) {
    list = list.filter((o) => {
      const id = String(o?.id || '').toLowerCase();
      const ref = String(o?.order_ref || '').toLowerCase();
      const items = (o?.order_items || [])
        .map((i) => String(i?.name_snapshot || '').toLowerCase())
        .join(' ');
      return id.includes(q) || ref.includes(q) || items.includes(q);
    });
  }
  return list;
}

export function getPendingOrders(orders = []) {
  return (orders || []).filter((o) => isOrderIncomplete(o));
}

export async function fetchUserOrders(userId, { limit = 100 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchUserTransactions(userId, { limit = 100 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function fetchUserRecharges(userId, { limit = 50 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('recharge_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    // Table may be missing on old DBs
    if (/relation|does not exist|permission/i.test(error.message || '')) return [];
    throw error;
  }
  return data || [];
}

export function sumCompletedOrderSpend(orders = []) {
  return (orders || [])
    .filter((o) => o.status === 'completed')
    .reduce((sum, o) => sum + parseFloat(o.total || 0), 0);
}

export function sumRechargeCredits(transactions = []) {
  return (transactions || [])
    .filter((tx) => tx.type === 'recharge')
    .reduce((sum, tx) => sum + parseFloat(tx.amount || 0), 0);
}

export function formatMoney(amount) {
  const n = parseFloat(amount);
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}
