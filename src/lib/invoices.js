import { supabase } from './supabase';
import { adminGetUserProfile } from './adminModeration';
import { buildOrderInvoice, buildRechargeInvoice } from './invoiceBuilder';

async function resolveInvoiceProfile(userId, viewer = null) {
  if (!userId) return null;

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('name, username')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw error;

  let email = null;
  if (viewer?.id === userId && viewer?.email) {
    email = viewer.email;
  } else if (viewer?.role === 'admin' && viewer.id !== userId) {
    try {
      const adminProfile = await adminGetUserProfile(userId);
      email = adminProfile?.email || null;
      return {
        name: profile?.name || adminProfile?.name || null,
        username: profile?.username || adminProfile?.username || null,
        email,
      };
    } catch {
      // Fall back to public profile fields only.
    }
  }

  return {
    name: profile?.name || null,
    username: profile?.username || null,
    email,
  };
}

export async function fetchOrderInvoiceData(
  orderId,
  { games = [], offers = [], t = {}, lang = 'ar', viewer = null } = {},
) {
  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) throw orderError;
  if (!order) return null;

  const { data: items, error: itemsError } = await supabase
    .from('order_items')
    .select('*')
    .eq('order_id', orderId);

  if (itemsError) throw itemsError;

  const profile = await resolveInvoiceProfile(order.user_id, viewer);

  return buildOrderInvoice({
    order,
    items: items || [],
    games,
    offers,
    profile,
    t,
    lang,
  });
}

export async function fetchRechargeInvoiceData(
  rechargeId,
  { t = {}, lang = 'ar', viewer = null } = {},
) {
  const { data: recharge, error: rechargeError } = await supabase
    .from('recharge_requests')
    .select('*')
    .eq('id', rechargeId)
    .maybeSingle();

  if (rechargeError) throw rechargeError;
  if (!recharge) return null;

  const [{ data: samRows }, { data: txRows }, profile] = await Promise.all([
    supabase
      .from('sam_invoices')
      .select('sam_invoice_id, transaction_ref, payment_method, currency, status, amount')
      .eq('entity_type', 'recharge')
      .eq('entity_id', rechargeId)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from('transactions')
      .select('reference, balance_after, amount, created_at')
      .eq('user_id', recharge.user_id)
      .eq('type', 'recharge')
      .order('created_at', { ascending: false })
      .limit(5),
    resolveInvoiceProfile(recharge.user_id, viewer),
  ]);

  const samInvoice = Array.isArray(samRows) ? samRows[0] : null;
  const transaction = (txRows || []).find((row) => {
    const ref = recharge.reference || samInvoice?.transaction_ref;
    if (ref && row.reference === ref) return true;
    return Math.abs(parseFloat(row.amount || 0) - parseFloat(recharge.amount || 0)) < 0.01;
  }) || (txRows || [])[0] || null;

  return buildRechargeInvoice({
    recharge,
    samInvoice,
    transaction,
    profile,
    t,
    lang,
  });
}

export function canViewOrderInvoice(order, user) {
  if (!order || !user) return false;
  if (user.role === 'admin') return true;
  return order.user_id === user.id;
}

export function canViewRechargeInvoice(recharge, user) {
  if (!recharge || !user) return false;
  if (user.role === 'admin') return true;
  return recharge.user_id === user.id;
}

export function isInvoiceReadyForOrder(order) {
  if (!order) return false;
  if (order.status !== 'completed') return false;
  if (order.fulfillment_status === 'fulfilled') return true;
  if (order.payment_method === 'admin_gift') return true;
  return false;
}

export function isInvoiceReadyForRecharge(recharge) {
  return recharge?.status === 'approved';
}