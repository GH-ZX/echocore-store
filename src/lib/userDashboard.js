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

/** The customer's latest completed order lines, newest first (for "Buy again"). */
export async function fetchRecentPurchasedItems(userId, { limit = 20 } = {}) {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('created_at, order_items(offer_id, player_uid, player_server)')
    .eq('user_id', userId)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data || []).flatMap((order) => (order.order_items || []).map((item) => ({
    offerId: item.offer_id,
    playerUid: item.player_uid || '',
    playerServer: item.player_server || '',
    boughtAt: order.created_at,
  })));
}

/**
 * Distinct packs from recent purchases that are still on sale, newest first,
 * each with the player id it was last sent to.
 */
export function pickBuyAgainOffers(items = [], offers = [], max = 4) {
  const byId = new Map(offers.filter((o) => o && o.active !== false).map((o) => [String(o.id), o]));
  const seen = new Set();
  const picks = [];
  for (const item of items) {
    const id = String(item?.offerId || '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const offer = byId.get(id);
    if (!offer) continue;
    picks.push({ offer, playerUid: item.playerUid || '', playerServer: item.playerServer || '' });
    if (picks.length >= max) break;
  }
  return picks;
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
