import { supabase } from './supabase';
import { adminGetUserProfile } from './adminModeration';
import { buildOrderInvoice, buildRechargeInvoice } from './invoiceBuilder';
import { extractDeliveryCodes } from './orderReceipt';

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

  const [{ data: samRows }, profile] = await Promise.all([
    supabase
      .from('sam_invoices')
      .select('payment_method, currency, status, amount')
      .eq('entity_type', 'recharge')
      .eq('entity_id', rechargeId)
      .order('created_at', { ascending: false })
      .limit(1),
    resolveInvoiceProfile(recharge.user_id, viewer),
  ]);

  const samInvoice = Array.isArray(samRows) ? samRows[0] : null;

  return buildRechargeInvoice({
    recharge,
    samInvoice,
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

/**
 * Official store invoice only after a successful sale outcome.
 * Redeem/gift products require delivery codes on the order items.
 * Top-ups require successful fulfillment (no code).
 *
 * Pass `items` when available so gift invoices wait for codes.
 */
export function isInvoiceReadyForOrder(order, { isAdmin: _isAdmin = false, items = null } = {}) {
  if (!order) return false;
  if (order.status !== 'completed') return false;

  const fs = order.fulfillment_status == null || order.fulfillment_status === ''
    ? null
    : String(order.fulfillment_status).trim();

  if (fs === 'failed') return false;
  if (fs === 'fulfilling') return false;

  const itemRows = Array.isArray(items) ? items : null;
  const codes = itemRows
    ? extractDeliveryCodes(itemRows, order.g2bulk_metadata)
    : [];
  const hasUid = itemRows
    ? itemRows.some((row) => String(row?.player_uid || '').trim())
    : false;

  // Redeem / gift code packs: invoice only when codes exist
  if (itemRows && !hasUid) {
    return codes.length > 0;
  }

  if (fs === 'fulfilled' || fs === 'skipped') return true;

  // Top-up with UID: allow after delivery window if still pending
  if (hasUid && (fs === 'pending' || fs == null)) {
    const created = order.created_at ? new Date(order.created_at).getTime() : 0;
    return created > 0 && Date.now() - created >= 15 * 60 * 1000;
  }

  // Without items (list views): only clear success statuses
  if (!itemRows) {
    if (fs === 'fulfilled' || fs === 'skipped') return true;
    if (order.payment_method === 'admin_gift') {
      // Gift list entry without items — only if already marked fulfilled/skipped
      return false;
    }
    const created = order.created_at ? new Date(order.created_at).getTime() : 0;
    if ((fs === 'pending' || fs == null) && created > 0) {
      return Date.now() - created >= 15 * 60 * 1000;
    }
  }

  // Codes present even if status lagging
  if (codes.length > 0) return true;

  return false;
}

/** Wallet recharge invoice only after credit succeeded. */
export function isInvoiceReadyForRecharge(recharge, { isAdmin: _isAdmin = false } = {}) {
  if (!recharge) return false;
  return recharge.status === 'approved';
}
